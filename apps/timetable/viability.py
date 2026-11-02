"""
Viability colour for a class, from its attendance count.

Each class type stores where each colour *starts*:

    count <  amber_threshold                    → red
    amber_threshold <= count < green_threshold  → amber
    green_threshold <= count < purple_threshold → green
    count >= purple_threshold                   → purple

This is the one place that rule lives. The timetable, the reports and the
attendance calendar all call it, so they cannot disagree about a class's
colour.
"""

RED = "red"
AMBER = "amber"
GREEN = "green"
PURPLE = "purple"
PENDING = "pending"


def viability_colour(count: int | None, amber: int, green: int, purple: int) -> str:
    """Colour for ``count`` given where amber, green and purple start."""
    if count is None:
        return PENDING
    if count >= purple:
        return PURPLE
    if count >= green:
        return GREEN
    if count >= amber:
        return AMBER
    return RED


def event_viability_colour(event, count: int | None) -> str:
    """Colour for a timetable event, honouring its per-class overrides."""
    return viability_colour(
        count,
        event.effective_amber_threshold,
        event.effective_green_threshold,
        event.effective_purple_threshold,
    )
