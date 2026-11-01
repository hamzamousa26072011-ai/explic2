import fs from 'fs';
import path from 'path';
import { db } from './index.ts';
import { users, workspaces, examinerEvaluations } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

export function isSqlAvailable(): boolean {
  if (!process.env.SQL_HOST) return false;
  if (process.env.SQL_HOST.startsWith('/')) {
    const socketPath = path.join(process.env.SQL_HOST, '.s.PGSQL.5432');
    return fs.existsSync(socketPath);
  }
  return true;
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string,
  friendCode?: string
) {
  if (!isSqlAvailable()) {
    return null;
  }
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName || email.split('@')[0],
        friendCode: friendCode || '',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          ...(displayName ? { displayName } : {}),
          ...(friendCode ? { friendCode } : {}),
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.warn('PostgreSQL notice in getOrCreateUser:', (error as any)?.message);
    return null;
  }
}

export async function saveSqlWorkspace(uid: string, payload: unknown) {
  if (!isSqlAvailable()) {
    return null;
  }
  try {
    const payloadStr =
      typeof payload === 'string' ? payload : JSON.stringify(payload);
    const existing = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, uid))
      .limit(1);

    if (existing.length > 0) {
      const updated = await db
        .update(workspaces)
        .set({ payload: payloadStr, updatedAt: new Date() })
        .where(eq(workspaces.userId, uid))
        .returning();
      return updated[0];
    } else {
      const created = await db
        .insert(workspaces)
        .values({ userId: uid, payload: payloadStr, updatedAt: new Date() })
        .returning();
      return created[0];
    }
  } catch (error) {
    console.warn('PostgreSQL notice in saveSqlWorkspace:', (error as any)?.message);
    return null;
  }
}

export async function loadSqlWorkspace(uid: string) {
  if (!isSqlAvailable()) {
    return null;
  }
  try {
    const result = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, uid))
      .limit(1);

    if (result.length > 0 && result[0].payload) {
      try {
        return JSON.parse(result[0].payload);
      } catch {
        return result[0].payload;
      }
    }
    return null;
  } catch (error) {
    console.warn('PostgreSQL notice in loadSqlWorkspace:', (error as any)?.message);
    return null;
  }
}

export async function saveSqlEvaluation(params: {
  userId: string;
  subject: string;
  board?: string;
  paperComponent?: string;
  provisionalGrade?: string;
  percentage?: number;
  awardedMarks?: number;
  totalMarks?: number;
  evaluationJson: string;
}) {
  if (!isSqlAvailable()) {
    return null;
  }
  try {
    const result = await db
      .insert(examinerEvaluations)
      .values({
        userId: params.userId,
        subject: params.subject,
        board: params.board || '',
        paperComponent: params.paperComponent || '',
        provisionalGrade: params.provisionalGrade || '',
        percentage: params.percentage ?? 0,
        awardedMarks: params.awardedMarks ?? 0,
        totalMarks: params.totalMarks ?? 0,
        evaluationJson: params.evaluationJson,
      })
      .returning();
    return result[0];
  } catch (error) {
    console.warn('PostgreSQL notice in saveSqlEvaluation:', (error as any)?.message);
    return null;
  }
}

export async function getUserEvaluations(userId: string) {
  if (!isSqlAvailable()) {
    return [];
  }
  try {
    return await db
      .select()
      .from(examinerEvaluations)
      .where(eq(examinerEvaluations.userId, userId))
      .orderBy(desc(examinerEvaluations.createdAt))
      .limit(20);
  } catch (error) {
    console.warn('PostgreSQL notice in getUserEvaluations:', (error as any)?.message);
    return [];
  }
}
