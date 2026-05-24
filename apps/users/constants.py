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
