export type Priority = 'low' | 'medium' | 'high';
export type Status = 'not_started' | 'in_progress' | 'completed';
export type AssignmentType = 'homework' | 'quiz' | 'test' | 'project' | 'essay' | 'reading' | 'other';
export type ThemePreference = 'light' | 'dark' | 'system';

/** A class / subject. Named `Course` in code to avoid clashing with the `class` keyword. */
export interface Course {
  id: string;
  name: string;
  code: string;
  color: string;
  teacher: string;
  createdAt: string;
}

export interface Assignment {
  id: string;
  title: string;
  courseId: string | null;
  notes: string;
  /** Local calendar date, `YYYY-MM-DD`. */
  dueDate: string;
  /** Local 24h time, `HH:MM`, or null when no specific time. */
  dueTime: string | null;
  estimatedMinutes: number | null;
  priority: Priority;
  type: AssignmentType;
  status: Status;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  userName: string;
  theme: ThemePreference;
  dailyStudyGoalMinutes: number;
  plannerShowCompleted: boolean;
}

/** Manually ordered daily study plans, keyed by `YYYY-MM-DD`. */
export type StudyPlan = Record<string, string[]>;

export interface AppData {
  version: 1;
  courses: Course[];
  assignments: Assignment[];
  settings: Settings;
  studyPlan: StudyPlan;
}

export type AssignmentInput = Omit<Assignment, 'id' | 'createdAt' | 'updatedAt' | 'completedAt'>;
export type CourseInput = Omit<Course, 'id' | 'createdAt'>;
