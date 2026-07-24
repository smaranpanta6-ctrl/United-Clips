export const nicheRoles = [
    {
        value: "all_campaigns",
        label: "All Campaigns",
        description: "Get notified about every campaign",
        emoji: "👀",
        roleId: "PUT_ALL_CAMPAIGNS_ROLE_ID_HERE"
    },
    {
        value: "edit_campaigns",
        label: "All Edit Campaigns",
        description: "Campaigns involving edited content",
        emoji: "🖱️",
        roleId: "PUT_EDIT_CAMPAIGNS_ROLE_ID_HERE"
    },
    {
        value: "clipping",
        label: "Clipping Campaigns",
        description: "Stream and video clipping campaigns",
        emoji: "📎",
        roleId: "PUT_CLIPPING_ROLE_ID_HERE"
    },
    {
        value: "tv_film",
        label: "TV / Film",
        description: "Movies, television shows and entertainment",
        emoji: "📺",
        roleId: "PUT_TV_FILM_ROLE_ID_HERE"
    },
    {
        value: "fancam_celeb",
        label: "Fancam / Celebrities",
        description: "Artists, actors, creators and models",
        emoji: "😎",
        roleId: "PUT_FANCAM_ROLE_ID_HERE"
    },
    {
        value: "gaming",
        label: "Gaming",
        description: "Gaming creators, streams and esports",
        emoji: "🎮",
        roleId: "PUT_GAMING_ROLE_ID_HERE"
    },
    {
        value: "music",
        label: "Music",
        description: "Artists, songs and music campaigns",
        emoji: "🎵",
        roleId: "PUT_MUSIC_ROLE_ID_HERE"
    },
    {
        value: "sports",
        label: "Sports",
        description: "Sports creators, clips and campaigns",
        emoji: "🏆",
        roleId: "PUT_SPORTS_ROLE_ID_HERE"
    }
];

export const nicheRoleIds = nicheRoles.map(niche => niche.roleId);
