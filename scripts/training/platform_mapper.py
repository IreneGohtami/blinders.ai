"""
Platform ID mapping utilities
"""

PLATFORM_MAP = {
    "youtube": 1,
    "instagram": 2,
    "tiktok": 3
}

def get_platform_id(platform_name):
    """
    Map platform name to numeric ID

    Args:
        platform_name (str): Platform name (case-insensitive)

    Returns:
        int: Platform ID, or 0 if not found
    """
    if not platform_name:
        return 0

    return PLATFORM_MAP.get(platform_name.lower().strip(), 0)

def get_platform_name(platform_id):
    """
    Map platform ID back to name

    Args:
        platform_id (int): Platform ID

    Returns:
        str: Platform name, or "unknown" if not found
    """
    reverse_map = {v: k for k, v in PLATFORM_MAP.items()}
    return reverse_map.get(platform_id, "unknown")

def get_all_platforms():
    """Get all available platforms"""
    return list(PLATFORM_MAP.keys())
