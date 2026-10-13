"""השוואת מדדי יומן בלי רעש סכימת float בין גרסאות Python; אינה משנה חישוב או יומן."""
import math


def summaries_match(left: dict, right: dict) -> bool:
    if left.keys() != right.keys():
        return False
    for variant, metrics in left.items():
        other = right[variant]
        if metrics.keys() != other.keys():
            return False
        for metric, value in metrics.items():
            expected = other[metric]
            if not math.isfinite(value) or not math.isfinite(expected):
                return False
            # עד ארבע יחידות בייצוג הבינארי, הרבה פחות מדיוק המדדים הרשומים.
            if abs(value - expected) > 4 * max(math.ulp(value), math.ulp(expected)):
                return False
    return True
