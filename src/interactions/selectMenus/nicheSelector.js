import { MessageFlags } from "discord.js";
import {
    nicheRoles,
    nicheRoleIds
} from "../../config/nicheRoles.js";

async function handleNicheSelector(interaction) {
    if (!interaction.guild) {
        return interaction.reply({
            content: "This menu can only be used inside a server.",
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({
        flags: MessageFlags.Ephemeral
    });

    const member = await interaction.guild.members.fetch(
        interaction.user.id
    );

    const selectedValues = new Set(interaction.values);

    const rolesToAdd = [];
    const rolesToRemove = [];

    for (const niche of nicheRoles) {
        const role = interaction.guild.roles.cache.get(niche.roleId);

        if (!role) {
            continue;
        }

        const selected = selectedValues.has(niche.value);
        const alreadyHasRole = member.roles.cache.has(niche.roleId);

        if (selected && !alreadyHasRole) {
            rolesToAdd.push(role);
        }

        if (!selected && alreadyHasRole) {
            rolesToRemove.push(role);
        }
    }

    if (rolesToAdd.length > 0) {
        await member.roles.add(
            rolesToAdd,
            "User selected campaign niches"
        );
    }

    if (rolesToRemove.length > 0) {
        await member.roles.remove(
            rolesToRemove,
            "User updated campaign niches"
        );
    }

    const selectedNiches = nicheRoles.filter(niche =>
        selectedValues.has(niche.value)
    );

    const selectionText = selectedNiches.length
        ? selectedNiches
            .map(niche => `${niche.emoji} **${niche.label}**`)
            .join("\n")
        : "You currently have no campaign niches selected.";

    return interaction.editReply({
        content: [
            "✅ Your campaign alert roles were updated.",
            "",
            selectionText
        ].join("\n")
    });
}

export default {
    name: "niche_selector",
    execute: handleNicheSelector
};
