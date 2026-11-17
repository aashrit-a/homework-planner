import type { AppData, Assignment, AssignmentType, Course, Priority, Status } from '../types';
import { addDaysKey, todayKey } from './date';
import { DEFAULT_SETTINGS } from './storage';

/**
 * Realistic demo semester. Dates are generated relative to today so the
 * dashboard always has something meaningful to show on first launch.
 */
export function createSampleData(): AppData {
  const now = new Date().toISOString();
  const today = todayKey();

  const courses: Course[] = [
    { id: 'c_cs201', name: 'Data Structures', code: 'CS 201', color: '#5b5bd6', teacher: 'Dr. Patel', createdAt: now },
    { id: 'c_math221', name: 'Linear Algebra', code: 'MATH 221', color: '#0d9488', teacher: 'Prof. Nguyen', createdAt: now },
    { id: 'c_psyc101', name: 'Intro to Psychology', code: 'PSYC 101', color: '#d6409f', teacher: 'Dr. Okafor', createdAt: now },
    { id: 'c_engl205', name: 'Modern Fiction', code: 'ENGL 205', color: '#ea580c', teacher: 'Prof. Lindqvist', createdAt: now },
    { id: 'c_econ102', name: 'Macroeconomics', code: 'ECON 102', color: '#3e8ef7', teacher: 'Dr. Ramirez', createdAt: now },
  ];

  type Seed = [
    title: string,
    courseId: string,
    dayOffset: number,
    time: string | null,
    est: number | null,
    priority: Priority,
    type: AssignmentType,
    status: Status,
    notes?: string,
  ];

  const seeds: Seed[] = [
    // Overdue
    ['Reading response: Ch. 4 "Memory"', 'c_psyc101', -1, '23:59', 45, 'medium', 'reading', 'not_started', 'Submit on Canvas. ~300 words, cite at least one study from the chapter.'],
    // Today
    ['Problem Set 7 — Eigenvalues', 'c_math221', 0, '17:00', 120, 'high', 'homework', 'in_progress', 'Problems 2, 5, 9, 14, 17 from §5.2. Show all work.'],
    ['Binary search tree lab', 'c_cs201', 0, '23:59', 90, 'high', 'homework', 'not_started', 'Implement insert, delete, and in-order traversal. Push to GitHub classroom.'],
    ['Read "The Remains of the Day" pp. 1–60', 'c_engl205', 0, null, 60, 'low', 'reading', 'completed'],
    // Tomorrow
    ['Quiz: Fiscal policy', 'c_econ102', 1, '10:00', 45, 'medium', 'quiz', 'not_started', 'Covers lectures 14–16. Review the multiplier examples.'],
    ['Discussion post: unreliable narrators', 'c_engl205', 1, '21:00', 30, 'low', 'homework', 'not_started'],
    // +2
    ['Hash table implementation', 'c_cs201', 2, '23:59', 180, 'high', 'project', 'not_started', 'Open addressing with linear probing. Include benchmarks vs. chaining.'],
    ['Research methods worksheet', 'c_psyc101', 2, '13:00', 40, 'medium', 'homework', 'not_started'],
    // +3
    ['Midterm 2 — Linear Algebra', 'c_math221', 3, '09:30', 300, 'high', 'test', 'not_started', 'Chapters 4–5. One page of notes allowed. Room 204.'],
    ['Essay outline: Ishiguro & memory', 'c_engl205', 3, null, 60, 'medium', 'essay', 'in_progress'],
    // +4
    ['Problem Set 8 — Diagonalization', 'c_math221', 4, '17:00', 120, 'medium', 'homework', 'not_started'],
    ['Lab report: Stroop effect', 'c_psyc101', 4, '23:59', 150, 'high', 'project', 'not_started', 'APA format, include data table and one figure.'],
    // +5 / +6
    ['Read Mankiw Ch. 12', 'c_econ102', 5, null, 50, 'low', 'reading', 'not_started'],
    ['Graph traversal practice set', 'c_cs201', 6, '23:59', 75, 'medium', 'homework', 'not_started'],
    // Next week
    ['Essay draft: Ishiguro & memory', 'c_engl205', 8, '23:59', 240, 'high', 'essay', 'not_started', '1,800–2,200 words. Bring a printed copy to workshop.'],
    ['Problem set: AD/AS model', 'c_econ102', 9, '17:00', 90, 'medium', 'homework', 'not_started'],
    ['Quiz: Learning & conditioning', 'c_psyc101', 10, '11:00', 45, 'medium', 'quiz', 'not_started'],
    ['Group project proposal', 'c_cs201', 12, '23:59', 120, 'medium', 'project', 'not_started', 'One page. Team: Sam, Priya, Jordan.'],
    ['Final project: market analysis', 'c_econ102', 20, '23:59', 600, 'high', 'project', 'not_started'],
    // Earlier, completed
    ['Problem Set 6 — Determinants', 'c_math221', -4, '17:00', 110, 'medium', 'homework', 'completed'],
    ['Linked list lab', 'c_cs201', -3, '23:59', 90, 'medium', 'homework', 'completed'],
    ['Quiz: Monetary policy', 'c_econ102', -2, '10:00', 40, 'medium', 'quiz', 'completed'],
    ['Reading response: Ch. 3 "Sensation"', 'c_psyc101', -6, '23:59', 45, 'low', 'reading', 'completed'],
  ];

  const assignments: Assignment[] = seeds.map(([title, courseId, offset, time, est, priority, type, status, notes], i) => ({
    id: `a_seed${i}`,
    title,
    courseId,
    notes: notes ?? '',
    dueDate: addDaysKey(today, offset),
    dueTime: time,
    estimatedMinutes: est,
    priority,
    type,
    status,
    completedAt: status === 'completed' ? now : null,
    createdAt: now,
    updatedAt: now,
  }));

  return {
    version: 1,
    courses,
    assignments,
    settings: { ...DEFAULT_SETTINGS, userName: 'Alex' },
    studyPlan: { [today]: ['a_seed1', 'a_seed2', 'a_seed0'] },
  };
}

export function createEmptyData(userName = ''): AppData {
  return { version: 1, courses: [], assignments: [], settings: { ...DEFAULT_SETTINGS, userName }, studyPlan: {} };
}
