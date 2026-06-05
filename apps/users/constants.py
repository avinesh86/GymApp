class UserRole:
    OWNER = "owner"
    ADMIN = "admin"
    GYM_MANAGER = "gym_manager"
    PAYROLL = "payroll"
    TEAM_LEADER = "team_leader"
    INSTRUCTOR = "instructor"
    CLASS_COUNT_ADMIN = "class_count_admin"

    CHOICES = [
        (OWNER, "Owner"),
        (ADMIN, "Admin"),
        (GYM_MANAGER, "Gym Manager"),
        (PAYROLL, "Payroll"),
        (TEAM_LEADER, "Team Leader"),
        (INSTRUCTOR, "Instructor"),
        (CLASS_COUNT_ADMIN, "Class Count Admin"),
    ]

    MANAGEMENT_ROLES = [OWNER, ADMIN, GYM_MANAGER]
    STAFF_ROLES = [TEAM_LEADER, INSTRUCTOR]

    _VALID = {OWNER, ADMIN, GYM_MANAGER, PAYROLL, TEAM_LEADER, INSTRUCTOR, CLASS_COUNT_ADMIN}

    @classmethod
    def from_staff_role(cls, role: str) -> str:
        """Map a free-text StaffProfile.role to a valid User.role.

        StaffProfile.role is an unvalidated string; anything we don't recognise
        falls back to instructor, the least-privileged staff role.
        """
        normalized = (role or "").strip().lower().replace(" ", "_").replace("-", "_")
        return normalized if normalized in cls._VALID else cls.INSTRUCTOR
