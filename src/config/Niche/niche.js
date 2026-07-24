import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    EmbedBuilder
} from "discord.js";

import { nicheRoles } from "../../config/nicheRoles.js";

function createNicheMenu() {
    const menu = new StringSelectMenuBuilder()
        .setCustomId("niche_selector")
        .setPlaceholder("Choose your campaign niches...")
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
        .setDescription("Manage the UNITED CLIPS niche selector")
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

        if (!interaction.channel) {
            return interaction.reply({
                content: "❌ I could not find the channel.",
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x111318)
            .setAuthor({
                name: "UNITED CLIPS"
            })
            .setTitle("Choose Your Campaign Niches")
            .setDescription(
                [
                    "Personalize the opportunities you receive.",
                    "",
                    "Select the campaign categories that match your content and interests. You will only be notified when a campaign fits one of your selected niches.",
                    "",
                    "**How it works**",
                    "✦ Select one or multiple categories",
                    "✦ Update your selections whenever you want",
                    "✦ Deselect a category to remove its role",
                    "",
                    "*Your selections determine which campaign alerts you receive.*"
                ].join("\n")
            )
            .setFooter({
                text: "UNITED CLIPS • Campaign Preferences"
            })
            .setTimestamp();

        await interaction.channel.send({
            embeds: [embed],
            components: [createNicheMenu()]
        });

        await interaction.reply({
            content: "✅ The UNITED CLIPS niche selector was posted.",
            ephemeral: true
        });
    }
};
