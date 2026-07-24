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
        try {
            const nicheChannel = await interaction.client.channels.fetch(
                "1529961568278941857"
            );

            if (!nicheChannel?.isTextBased()) {
                return interaction.reply({
                    content: "❌ I could not find the niche-selector channel.",
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0xC9A96E)
                .setAuthor({
                    name: "UNITED CLIPS"
                })
                .setTitle("Choose Your Campaign Niches")
                .setDescription(
                    [
                        "Personalize the campaign opportunities you receive.",
                        "",
                        "Select one or multiple categories below. You will automatically receive the matching notification roles.",
                        "",
                        "**How it works**",
                        "✦ Select your preferred niches",
                        "✦ Update your choices at any time",
                        "✦ Deselect a niche to remove its role",
                        "",
                        "*Never miss an opportunity built for your content.*"
                    ].join("\n")
                )
                .setFooter({
                    text: "UNITED CLIPS • Campaign Preferences"
                })
                .setTimestamp();

            await nicheChannel.send({
                embeds: [embed],
                components: [createNicheMenu()]
            });

            return interaction.reply({
                content: "✅ Niche selector posted in the niche-selector channel.",
                ephemeral: true
            });
        } catch (error) {
            console.error("Failed to post niche selector:", error);

            return interaction.reply({
                content: "❌ Something went wrong while posting the niche selector.",
                ephemeral: true
            });
        }
    }
};
