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
        .setDescription("Post the UNITED CLIPS niche selector")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

        .addSubcommand(subcommand =>
            subcommand
                .setName("post")
                .setDescription("Post the campaign niche selector")
        ),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🎯 Choose Your Campaign Niches")
            .setDescription(
                [
                    "Select the campaign categories you're interested in.",
                    "",
                    "You'll automatically receive the matching notification roles.",
                    "",
                    "• Select one or more niches",
                    "• Remove a niche anytime",
                    "• Roles are managed automatically",
                    "",
                    "**Never miss a campaign that fits your content.**"
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
            content: "✅ Niche selector posted successfully.",
            ephemeral: true
        });
    }
};
