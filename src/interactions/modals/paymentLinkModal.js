import {
    EmbedBuilder,
    MessageFlags
} from "discord.js";

import { getColor } from "../../config/bot.js";
import { savePaymentMethod } from "../../services/paymentService.js";

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default {
    name: "payment_link_modal",

    async execute(interaction, client) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });

        const email = interaction.fields
            .getTextInputValue("paypal_email")
            .trim()
            .toLowerCase();

        if (!isValidEmail(email)) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("❌ Invalid PayPal Email")
                        .setDescription(
                            "Enter a valid email address connected to your PayPal account."
                        )
                        .setColor(getColor("error"))
                ]
            });
        }

        const payment = await savePaymentMethod(
    client,
    interaction.guild.id,
    interaction.user.id,
    "paypal",
    paypalEmail,
    interaction.user.username,
    interaction.member?.displayName ||
        interaction.user.globalName ||
        interaction.user.username
);
        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("✅ Wallet Updated")
                    .setDescription(
                        "Your payment method was successfully saved."
                    )
                    .addFields(
                        {
                            name: "Provider",
                            value: "💳 **PayPal**",
                            inline: false
                        },
                        {
                            name: "Payment Email",
                            value: `\`${payment.account_email}\``,
                            inline: false
                        }
                    )
                    .setFooter({
                        text: "Future campaign payouts will be routed to this address."
                    })
                    .setColor(getColor("success"))
                    .setTimestamp()
            ]
        });
    }
};
