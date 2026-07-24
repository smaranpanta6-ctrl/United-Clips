import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} from "discord.js";

import { getColor } from "../../../config/bot.js";

import {
    getPaymentMethods,
    getUserEarnings,
    removePaymentMethod
} from "../../../services/paymentService.js";

function hideEmail(email) {
    const [name, domain] = String(email || "").split("@");

    if (!name || !domain) {
        return email;
    }

    const visible = name.slice(0, 2);
    const hidden = "*".repeat(Math.max(3, name.length - 2));

    return `${visible}${hidden}@${domain}`;
}

async function handleLinkPayment(interaction) {
    const emailInput = new TextInputBuilder()
        .setCustomId("paypal_email")
        .setLabel("PayPal email")
        .setPlaceholder("Enter the PayPal email used for payouts")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(5)
        .setMaxLength(254);

    const modal = new ModalBuilder()
        .setCustomId("payment_link_modal")
        .setTitle("💸 Add Payment Method")
        .addComponents(
            new ActionRowBuilder().addComponents(emailInput)
        );

    return interaction.showModal(modal);
}

async function handleManagePayments(interaction, client) {
    await interaction.deferReply({
        flags: MessageFlags.Ephemeral
    });

    const methods = await getPaymentMethods(
        client,
        interaction.guild.id,
        interaction.user.id
    );

    if (methods.length === 0) {
        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("📋 Payment Methods")
                    .setDescription(
                        "You do not have a payment method linked yet.\n\nPress **Link Payment Method** to add your PayPal email."
                    )
                    .setColor(getColor("warning"))
            ]
        });
    }

    const method = methods[0];

    const embed = new EmbedBuilder()
        .setTitle("✅ Payment Method Linked")
        .setDescription(
            "All future campaign payouts will be routed to this payment account."
        )
        .addFields(
            {
                name: "Provider",
                value: "💳 **PayPal**",
                inline: true
            },
            {
                name: "Payment Email",
                value: `\`${hideEmail(method.account_email)}\``,
                inline: true
            },
            {
                name: "Last Updated",
                value: `<t:${Math.floor(
                    new Date(method.updated_at).getTime() / 1000
                )}:R>`,
                inline: false
            }
        )
        .setColor(getColor("success"))
        .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("payment_link")
            .setLabel("Update PayPal")
            .setEmoji("✏️")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId("payment_unlink")
            .setLabel("Unlink Payment")
            .setEmoji("🗑️")
            .setStyle(ButtonStyle.Danger)
    );

    return interaction.editReply({
        embeds: [embed],
        components: [buttons]
    });
}

async function handleBalance(interaction, client) {
    await interaction.deferReply({
        flags: MessageFlags.Ephemeral
    });

    const result = await getUserEarnings(
        client,
        interaction.guild.id,
        interaction.user.id,
        15
    );

    const embed = new EmbedBuilder()
        .setTitle(`💵 ${interaction.user.username}'s Estimated Balance`)
        .setColor(getColor("success"))
        .setThumbnail(interaction.user.displayAvatarURL())
        .setFooter({
            text: `${interaction.guild.name} • Latest ${result.earnings.length} earning records`
        })
        .setTimestamp();

    if (result.earnings.length === 0) {
        embed.setDescription(
            [
                "You do not have any campaign earnings recorded yet.",
                "",
                "**Total Estimated Balance: `$0.00`**"
            ].join("\n")
        );

        return interaction.editReply({
            embeds: [embed]
        });
    }

    for (const earning of result.earnings) {
        const cycleText = earning.cycle_name
            ? ` (${earning.cycle_name})`
            : "";

        const statusText =
            earning.status === "paid"
                ? "✅ Paid"
                : earning.status === "approved"
                    ? "🟢 Approved"
                    : earning.status === "cancelled"
                        ? "❌ Cancelled"
                        : "🟡 Estimated";

        embed.addFields({
            name: `${earning.campaign_name}${cycleText}`,
            value: [
                `Earned: **$${Number(earning.amount).toFixed(2)}**`,
                `Status: ${statusText}`,
                `<t:${Math.floor(
                    new Date(earning.created_at).getTime() / 1000
                )}:d>`
            ].join("\n"),
            inline: false
        });
    }

    embed.addFields({
        name: "💰 Total Estimated Balance",
        value: `**$${result.totalBalance.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}**`,
        inline: false
    });

    return interaction.editReply({
        embeds: [embed]
    });
}

async function handleUnlinkPayment(interaction, client) {
    await interaction.deferReply({
        flags: MessageFlags.Ephemeral
    });

    const removed = await removePaymentMethod(
        client,
        interaction.guild.id,
        interaction.user.id,
        "paypal"
    );

    if (!removed) {
        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("No Payment Method Found")
                    .setDescription(
                        "You do not currently have a PayPal account linked."
                    )
                    .setColor(getColor("warning"))
            ],
            components: []
        });
    }

    return interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setTitle("🗑️ Payment Method Removed")
                .setDescription(
                    "Your PayPal payment method has been unlinked."
                )
                .setColor(getColor("success"))
        ],
        components: []
    });
}

export default [
    {
        name: "payment_link",
        execute: handleLinkPayment
    },
    {
        name: "payment_manage",
        execute: handleManagePayments
    },
    {
        name: "payment_balance",
        execute: handleBalance
    },
    {
        name: "payment_unlink",
        execute: handleUnlinkPayment
    }
];
