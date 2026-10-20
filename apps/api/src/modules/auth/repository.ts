import type { PublicUser } from '@ticketforge/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

export interface AuthRepository {
  register(
    email: string,
    passwordHash: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<PublicUser | null>;
  findUser(
    email: string,
  ): Promise<(PublicUser & { passwordHash: string }) | null>;
  createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void>;
  findSession(tokenHash: string): Promise<PublicUser | null>;
  deleteSession(tokenHash: string): Promise<void>;
}

export function createAuthRepository(database: PrismaClient): AuthRepository {
  return {
    async register(email, passwordHash, tokenHash, expiresAt) {
      try {
        return await database.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: { email, passwordHash },
            select: { id: true, email: true },
          });
          await tx.session.create({
            data: { userId: user.id, tokenHash, expiresAt },
          });
          return user;
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          return null;
        throw error;
      }
    },
    findUser(email) {
      return database.user.findUnique({
        where: { email },
        select: { id: true, email: true, passwordHash: true },
      });
    },
    async createSession(userId, tokenHash, expiresAt) {
      await database.session.create({ data: { userId, tokenHash, expiresAt } });
    },
    async findSession(tokenHash) {
      const row = await database.session.findUnique({
        where: { tokenHash },
        select: {
          expiresAt: true,
          user: { select: { id: true, email: true } },
        },
      });
      return row && row.expiresAt > new Date() ? row.user : null;
    },
    async deleteSession(tokenHash) {
      await database.session.deleteMany({ where: { tokenHash } });
    },
  };
}
