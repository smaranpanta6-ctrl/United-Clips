import { getMember } from './campaignMembers.js';

export async function campaignBelongsToGuild(interaction, campaign) {
    if (!interaction.guild || !campaign) return false;
    if (campaign.guildId) return campaign.guildId === interaction.guild.id;
    // Older records have no guildId. Verify their public channel in this guild.
    if (!campaign.channel) return false;
    const channel = interaction.guild.channels.cache.get(campaign.channel)
        || await interaction.guild.channels.fetch(campaign.channel).catch(() => null);
    return channel?.guildId === interaction.guild.id;
}

export async function submissionAccessError(interaction, client, campaign) {
    if (!await campaignBelongsToGuild(interaction, campaign)) {
        return 'This campaign is not available in this server.';
    }
    if (campaign.status !== 'Active') return campaign.status === 'Paused' ? 'This campaign is paused for submissions.' : 'This campaign is closed for submissions.';
    const member = await getMember(client, campaign.id, interaction.user.id);
    const joined = Array.isArray(campaign.members) && campaign.members.includes(interaction.user.id);
    if (!joined && (!member || member.active === false)) return 'Join this campaign before submitting a clip.';
    return null;
}
