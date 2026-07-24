import { PermissionFlagsBits } from "discord.js";
import { nicheRoles } from "../../config/nicheRoles.js";

export default {
    customId: "niche_selector",

    async execute(interaction) {
        await interaction.deferReply({
            ephemeral: true
        });

        if (!interaction.guild) {
            return interaction.editReply({
                content: "This menu can only be used inside a server."
            });
        }

        const botMember = interaction.guild.members.me;

        if (
            !botMember.permissions.has(PermissionFlagsBits.ManageRoles)
        ) {
            return interaction.editReply({
                content:
                    "The bot needs the **Manage Roles** permission before it can manage niche roles."
            });
        }

        const member = await interaction.guild.members.fetch(
            interaction.user.id
        );

        const selectedValues = interaction.values;
        const managedRoleIds = [];
        const selectedRoleIds = [];
        const selectedLabels = [];

        try {
            for (const niche of nicheRoles) {
                /*
                 * Find an existing role by its exact configured name.
                 * This prevents the bot from creating duplicate roles.
                 */
                let role = interaction.guild.roles.cache.find(
                    guildRole =>
                        guildRole.name.toLowerCase() ===
                        niche.roleName.toLowerCase()
                );

                /*
                 * Automatically create the role when it does not exist.
                 */
                if (!role) {
                    role = await interaction.guild.roles.create({
                        name: niche.roleName,
                        mentionable: true,
                        reason: "Automatic niche selector role"
                    });
                }

                managedRoleIds.push(role.id);

                if (selectedValues.includes(niche.value)) {
                    selectedRoleIds.push(role.id);
                    selectedLabels.push(
                        `${niche.emoji} ${niche.label}`
                    );
                }
            }

            /*
             * Roles selected by the member but not currently owned.
             */
            const rolesToAdd = selectedRoleIds.filter(
                roleId => !member.roles.cache.has(roleId)
            );

            /*
             * Niche roles currently owned but no longer selected.
             */
            const rolesToRemove = managedRoleIds.filter(
                roleId =>
                    member.roles.cache.has(roleId) &&
                    !selectedRoleIds.includes(roleId)
            );

            if (rolesToAdd.length > 0) {
                await member.roles.add(
                    rolesToAdd,
                    "Selected through the niche selector"
                );
            }

            if (rolesToRemove.length > 0) {
                await member.roles.remove(
                    rolesToRemove,
                    "Removed through the niche selector"
                );
            }

            if (selectedLabels.length === 0) {
                return interaction.editReply({
                    content:
                        "✦ Your campaign alert roles have been cleared."
                });
            }

            return interaction.editReply({
                content: [
                    "## Your preferences are updated",
                    "",
                    selectedLabels.join("\n"),
                    "",
                    "You will now receive alerts for these campaign categories."
                ].join("\n")
            });
        } catch (error) {
            console.error(
                "Failed to update niche selector roles:",
                error
            );

            return interaction.editReply({
                content: [
                    "I couldn't update your roles.",
                    "",
                    "Make sure:",
                    "• The bot has **Manage Roles**",
                    "• The bot's role is above the niche roles",
                    "• The roles are not managed by another integration"
                ].join("\n")
            });
        }
    }
};
