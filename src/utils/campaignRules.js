import { EmbedBuilder } from 'discord.js';

export function buildCampaignRules(campaign) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`📋 ${campaign.name} • Rules`.slice(0, 256))
        .setDescription(`**Campaign brief**\n${campaign.brief || 'Read the campaign announcement and ask staff about any missing requirements.'}`)
        .addFields(
            { name: '🎬 Content quality', value: '• Submit original content you have permission to use.\n• Follow the brief, platform rules, and server guidelines.' },
            { name: '📊 Fair participation', value: '• No fake views, bots, or paid engagement.\n• Submit each video once; copied or reposted clips may be rejected.' },
            { name: '📤 Before you submit', value: '• Check the published rate, minimum views, deadline, and limits.\n• Keep your video public for the review and payout period stated in the brief.\n• Use Submit Clip in this campaign workspace.' }
        )
        .setFooter({ text: 'United Clips • Staff reviews eligibility • Questions? Open a support ticket' });
    if (campaign.audioLink) embed.addFields({ name: '🔊 Campaign audio', value: campaign.audioLink });
    if (campaign.audioFile?.url) embed.addFields({ name: '📎 Audio file', value: 'The campaign audio is attached below. Follow the requirements in the brief.' });
    return embed;
}
