import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    EmbedBuilder
} from "discord.js";

import { nicheRoles } from "../../config/nicheRoles.js";
import { getColor } from "../../config/bot.js";

function createNicheMenu() {
    const menu = new StringSelectMenuBuilder()
        .setCustomId("niche_selector")
        .setPlaceholder("Select the campaign niches you want...")
        .setMinValues(0)
        .setMaxValues(nicheRoles.length);

    for (const niche of nicheRoles) {
        menu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(niche.label)
                .setDescription(niche.description)
                .setValue(niche.value)
                .setEmoji(niche.emoji)
        );
    }

    return new ActionRowBuilder().addComponents(menu);
}

export default {
    data: new SlashCommandBuilder()
        .setName("niche")
        .setDescription("Manage the campaign niche selector")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

        .addSubcommand(subcommand =>
            subcommand
                .setName("post")
                .setDescription("Post the campaign niche selector")
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand !== "post") {
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("🔔 Get Alerts About Campaigns in Your Niche")
            .setDescription(
                [
                    "Choose the types of campaigns you want to be notified about.",
                    "",
                    "You can select multiple niches.",
                    "Open the menu again at any time to update your choices.",
                    "",
                    "**Selecting an option adds its role.**",
                    "**Removing an option removes its role.**"
                ].join("\n")
            )
            .setColor(getColor("info"))
            .setFooter({
                text: "Your selections can be changed at any time"
            })
            .setTimestamp();

        await interaction.channel.send({
            embeds: [embed],
            components: [createNicheMenu()]
        });

        await interaction.reply({
            content: "✅ Niche selector posted.",
            ephemeral: true
        });
    }
};
