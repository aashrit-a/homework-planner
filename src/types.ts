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
  updatedAt: string;
}

/** One item on a test's study checklist. */
export interface StudyTopic {
  id: string;
  text: string;
  done: boolean;
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
  /** Where a test or quiz takes place (room, building, online). */
  location: string;
  /** Study checklist, used mainly for tests and quizzes. */
  topics: StudyTopic[];
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
  /** When settings / the study plan last changed; used to pick the newer copy when syncing. */
  settingsUpdatedAt: string;
  planUpdatedAt: string;
  /**
   * Ids of deleted classes and assignments with the time they were deleted, so a
   * sync merge never brings them back. Entries are pruned after 180 days.
   */
  deleted: Record<string, string>;
}

export type AssignmentInput = Omit<Assignment, 'id' | 'createdAt' | 'updatedAt' | 'completedAt' | 'location' | 'topics'> &
  Partial<Pick<Assignment, 'location' | 'topics'>>;
export type CourseInput = Omit<Course, 'id' | 'createdAt' | 'updatedAt'>;
