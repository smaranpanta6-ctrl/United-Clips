import { EmbedBuilder } from 'discord.js';

export function buildCampaignRules(campaign) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`📋 ${campaign.name} • Rules`.slice(0, 256))
        .setDescription(`**Campaign brief**\n${campaign.brief || 'Read the campaign announcement and ask staff about any missing requirements.'}\n\n**TikTok sound link**\n${campaign.audioLink || 'Awaiting the campaign team. Ask staff for the required sound before posting.'}`)
        .addFields(
            { name: '🎬 Content quality', value: '• Submit original content you have permission to use.\n• Follow the brief, platform rules, and server guidelines.' },
            { name: '📊 Fair participation', value: '• No fake views, bots, or paid engagement.\n• Submit each video once; copied or reposted clips may be rejected.' },
            { name: '📤 Before you submit', value: '• Check the published rate, minimum views, deadline, and limits.\n• Keep your video public for the review and payout period stated in the brief.\n• Use Submit Clip in this campaign workspace.' },
            { name: '🔊 Required sound • 5% minimum', value: 'Use the TikTok sound linked above or you will not get paid.\n\nSet **Added Sound to 5% volume or higher** when posting. **If you set it to 0%, it will not count and you will not get paid.** Do not mute or replace the required sound.' }
        )
        .setFooter({ text: 'United Clips • Staff reviews eligibility • Questions? Open a support ticket' });
    if (campaign.audioFile?.url) embed.addFields({ name: '📎 Download for editing', value: 'Download the audio attachment below and import it into CapCut or your editing app. When posting to TikTok, also attach the linked sound and keep Added Sound at 5% or higher.' });
    return embed;
}
