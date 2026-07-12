from enum import StrEnum


class LearningStatus(StrEnum):
    NEW = "new"
    LEARNING = "learning"
    ATTEMPTED = "attempted"
    CONFIDENT = "confident"
    MASTERED = "mastered"
