import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// Users table keyed by Firebase Auth UID
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  friendCode: text('friend_code'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Student workspaces (tasks, exams, habits, study rooms, study tools)
export const workspaces = pgTable('workspaces', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.uid),
  payload: text('payload').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Saved AI Examiner evaluations
export const examinerEvaluations = pgTable('examiner_evaluations', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.uid),
  subject: text('subject').notNull(),
  board: text('board'),
  paperComponent: text('paper_component'),
  provisionalGrade: text('provisional_grade'),
  percentage: integer('percentage'),
  awardedMarks: integer('awarded_marks'),
  totalMarks: integer('total_marks'),
  evaluationJson: text('evaluation_json').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  workspaces: many(workspaces),
  examinerEvaluations: many(examinerEvaluations),
}));

export const workspacesRelations = relations(workspaces, ({ one }) => ({
  user: one(users, {
    fields: [workspaces.userId],
    references: [users.uid],
  }),
}));

export const examinerEvaluationsRelations = relations(
  examinerEvaluations,
  ({ one }) => ({
    user: one(users, {
      fields: [examinerEvaluations.userId],
      references: [users.uid],
    }),
  })
);
