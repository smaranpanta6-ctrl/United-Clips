import { PermissionFlagsBits } from "discord.js";
import { nicheRoles } from "../../config/nicheRoles.js";

export default {
    name: "niche_selector",

    async execute(interaction) {
        await interaction.deferReply({
            ephemeral: true
        });

        try {
            if (!interaction.guild) {
                return interaction.editReply({
                    content: "❌ This selector only works inside the server."
                });
            }

            const botMember = interaction.guild.members.me;

            if (
                !botMember ||
                !botMember.permissions.has(PermissionFlagsBits.ManageRoles)
            ) {
                return interaction.editReply({
                    content: "❌ I need the **Manage Roles** permission."
                });
            }

            const member = await interaction.guild.members.fetch(
                interaction.user.id
            );

            const selectedValues = interaction.values;
            const allNicheRoleIds = [];
            const selectedRoleIds = [];
            const selectedNames = [];

            for (const niche of nicheRoles) {
                let role = interaction.guild.roles.cache.find(
                    existingRole =>
                        existingRole.name.toLowerCase() ===
                        niche.roleName.toLowerCase()
                );

                if (!role) {
                    role = await interaction.guild.roles.create({
                        name: niche.roleName,
                        mentionable: false,
                        reason: "Created by the UNITED CLIPS niche selector"
                    });
                }

                allNicheRoleIds.push(role.id);

                if (selectedValues.includes(niche.value)) {
                    selectedRoleIds.push(role.id);
                    selectedNames.push(`${niche.emoji} ${niche.label}`);
                }
            }

            const rolesToAdd = selectedRoleIds.filter(
                roleId => !member.roles.cache.has(roleId)
            );

            const rolesToRemove = allNicheRoleIds.filter(
                roleId =>
                    member.roles.cache.has(roleId) &&
                    !selectedRoleIds.includes(roleId)
            );

            if (rolesToAdd.length > 0) {
                await member.roles.add(
                    rolesToAdd,
                    "Selected through the UNITED CLIPS niche selector"
                );
            }

            if (rolesToRemove.length > 0) {
                await member.roles.remove(
                    rolesToRemove,
                    "Deselected through the UNITED CLIPS niche selector"
                );
            }

            if (selectedNames.length === 0) {
                return interaction.editReply({
                    content: "✅ All of your niche roles were removed."
                });
            }

            return interaction.editReply({
                content: [
                    "## 🎉 Congratulations — Niches Selected!",
                    "",
                    "You will now receive campaign alerts for:",
                    "",
                    selectedNames.join("\n"),
                    "",
                    "You can update your selections at any time."
                ].join("\n")
            });
        } catch (error) {
            console.error("Niche selector error:", error);

            return interaction.editReply({
                content: [
                    "❌ I couldn't update your niche roles.",
                    "",
                    "Make sure the bot has **Manage Roles** and its role is above all campaign roles."
                ].join("\n")
            });
        }
    }
};
