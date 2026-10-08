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
import { ensurePaymentTables, addCampaignEarning, setEarningStatus, getUserEarnings } from "../../services/paymentService.js";

const earningStatuses = [
    { name: 'Estimated', value: 'estimated' }, { name: 'Approved', value: 'approved' },
    { name: 'Paid externally', value: 'paid' }, { name: 'Cancelled', value: 'cancelled' }
];

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
        .setDescription("Manage payout details and staff-recorded earnings")
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

        .addSubcommand(subcommand =>
            subcommand
                .setName("post")
                .setDescription("Post the payment management panel")
        )
        .addSubcommand(sub => sub.setName('record').setDescription('Record reviewed earnings; this does not send money')
            .addUserOption(o => o.setName('creator').setDescription('Creator receiving the earning record').setRequired(true))
            .addStringOption(o => o.setName('campaign').setDescription('Campaign name').setMaxLength(100).setRequired(true))
            .addNumberOption(o => o.setName('amount').setDescription('Reviewed amount in USD').setMinValue(0).setMaxValue(9999999999.99).setRequired(true))
            .addStringOption(o => o.setName('reference').setDescription('Unique record reference, e.g. submission-123-october').setMaxLength(80).setRequired(true))
            .addStringOption(o => o.setName('status').setDescription('Record status; paid means already paid externally').addChoices(...earningStatuses).setRequired(true))
            .addStringOption(o => o.setName('cycle').setDescription('Payout cycle label').setMaxLength(60)))
        .addSubcommand(sub => sub.setName('status').setDescription('Update an earning record; this does not send money')
            .addIntegerOption(o => o.setName('record').setDescription('Earning record ID').setMinValue(1).setRequired(true))
            .addStringOption(o => o.setName('status').setDescription('Paid means a payment already completed externally').addChoices(...earningStatuses).setRequired(true)))
        .addSubcommand(sub => sub.setName('ledger').setDescription('View a creator’s latest earning record IDs privately')
            .addUserOption(o => o.setName('creator').setDescription('Creator to look up').setRequired(true))),

    async execute(interaction, config, client) {
        client ??= interaction.client;
        const staffRoleId = process.env.STAFF_ROLE_ID || '1529961495402778771';
        if (!interaction.guild || (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
            && !interaction.member?.roles?.cache?.has(staffRoleId))) {
            return interaction.reply({ content: 'Only the campaign team can manage payout records.', flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });

        await ensurePaymentTables(client);

        const subcommand = interaction.options.getSubcommand();
        try {
            if (subcommand === 'record') {
                const creator = interaction.options.getUser('creator', true);
                if (interaction.options.getString('reference',true).trim().startsWith('auto:')) {
                    return interaction.editReply({ content: 'References starting with auto: are reserved for video tracking. Use your own unique reference.' });
                }
                if (creator.bot || !await interaction.guild.members.fetch(creator.id).catch(() => null)) {
                    return interaction.editReply({ content: 'Choose a creator who belongs to this server.' });
                }
                const result = await addCampaignEarning(client, {
                    guildId: interaction.guild.id, userId: creator.id,
                    campaignName: interaction.options.getString('campaign', true).trim(),
                    amount: interaction.options.getNumber('amount', true),
                    reference: interaction.options.getString('reference', true).trim(),
                    status: interaction.options.getString('status', true),
                    cycleName: interaction.options.getString('cycle')?.trim() || null,
                    recordedBy: interaction.user.id
                });
                return interaction.editReply({ content: result.created
                    ? `Saved earning record #${result.id}. The creator can view it under My Earnings. No money was sent.`
                    : `That reference already belongs to record #${result.id}. No duplicate was added. Use /payments status to update its status.` });
            }
            if (subcommand === 'status') {
                const record = await setEarningStatus(client, {
                    guildId: interaction.guild.id, earningId: interaction.options.getInteger('record', true),
                    status: interaction.options.getString('status', true), recordedBy: interaction.user.id
                });
                return interaction.editReply({ content: record
                    ? `Record #${record.id} is ${record.status}. No money was sent.` : 'That earning record was not found in this server.' });
            }
            if (subcommand === 'ledger') {
                const creator = interaction.options.getUser('creator', true);
                const result = await getUserEarnings(client, interaction.guild.id, creator.id);
                const embed = new EmbedBuilder().setTitle('Staff Earnings Ledger').setColor(getColor('success'))
                    .setDescription(result.earnings.length ? result.earnings.map(row =>
                        `**#${row.id} · ${row.campaign_name}**\n$${Number(row.amount).toFixed(2)} · ${row.status}${row.record_reference ? ` · ${row.record_reference}` : ''}`
                    ).join('\n\n').slice(0, 4000) : 'No earnings recorded for this creator.')
                    .setFooter({ text: 'Private staff ledger · Paid records reflect payments completed externally' });
                return interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            const message = /^Use a non-negative|^Invalid earning/.test(error.message)
                ? error.message : 'The earning record could not be saved. Check the database connection and try again with the same reference.';
            return interaction.editReply({ content: message });
        }

        const embed = new EmbedBuilder()
    .setTitle("💸 United Clips Payout Center")
    .setDescription(
        [
            "Save your payout details for staff and view your recorded campaign earnings privately.",
            "",
            "💳 **Add Payout Account**",
            "Save or update the PayPal email staff uses for payouts. Never enter your PayPal password.",
            "",
            "⚙️ **My Payout Settings**",
            "View your linked account or remove it.",
            "",
            "📈 **View My Earnings**",
            "See earnings and payout status recorded by the campaign team.",
            "",
            "Staff reviews views and amounts against each campaign’s terms. Saving an email or approving a clip does not send money."
        ].join("\n")
    )
    .setColor(getColor("success"))
    .setFooter({
        text: `${interaction.guild.name} • Private payout settings · Staff-reviewed records`
    })
    .setTimestamp();

        const payload = {
            embeds: [embed],
            components: [createPaymentPanelButtons()], allowedMentions: { parse: [] }
        };
        const recent = await interaction.channel.messages.fetch({ limit: 30 }).catch(() => null);
        const existing = recent?.find(message => message.author.id === client.user.id && message.components.some(row =>
            row.components.some(component => component.customId === 'payment_link')));
        const message = existing ? await existing.edit(payload) : await interaction.channel.send(payload);
        await message.pin().catch(() => null);

        return interaction.editReply({
            content: existing ? '✅ Payout panel updated and pinned.' : '✅ Payout panel posted and pinned.'
        });
    }
};
