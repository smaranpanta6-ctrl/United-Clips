import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags
} from "discord.js";

import { getColor } from "../../config/bot.js";
import { ensurePaymentTables } from "../../services/paymentService.js";

function createPaymentPanelButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("payment_link")
            .setLabel("Add Payout Account")
            .setEmoji("💳")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId("payment_manage")
            .setLabel("My Payout Settings")
            .setEmoji("⚙️")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId("payment_balance")
            .setLabel("View My Earnings")
            .setEmoji("📈")
            .setStyle(ButtonStyle.Success)
    );
}

export default {
    data: new SlashCommandBuilder()
        .setName("payments")
        .setDescription("Manage the server payment panel")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

        .addSubcommand(subcommand =>
            subcommand
                .setName("post")
                .setDescription("Post the payment management panel")
        ),

    async execute(interaction, config, client) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });

        await ensurePaymentTables(client);

        const embed = new EmbedBuilder()
    .setTitle("💸 United Clips Payout Center")
    .setDescription(
        [
            "Manage where your campaign earnings are sent and track your current payout balance.",
            "",
            "💳 **Add Payout Account**",
            "Connect or update the PayPal account used for payouts.",
            "",
            "⚙️ **My Payout Settings**",
            "View your linked account or remove it.",
            "",
            "📈 **View My Earnings**",
            "See your campaign earnings and estimated payout."
        ].join("\n")
    )
    .setColor(getColor("success"))
    .setFooter({
        text: `${interaction.guild.name} • Secure payouts`
    })
    .setTimestamp();

        await interaction.channel.send({
            embeds: [embed],
            components: [createPaymentPanelButtons()]
        });

        return interaction.editReply({
            content: "✅ Payment panel posted."
        });
    }
};
