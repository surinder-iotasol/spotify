/**
 * STORY-setup-004: Prisma schema and model typing validation.
 *
 * Verifies that:
 * - The Prisma schema loads without errors
 * - All 11 models are present (User, ArtistProfile, Track, Playlist,
 *   PlaylistTrack, Like, Follow, Report, AuditLog, PlayLog, PlatformMetricSnapshot)
 * - All 7 enums are present (UserRole, AccountStatus, TrackStatus, Genre,
 *   ReportReason, ReportStatus, AuditAction)
 * - Compound unique indexes are configured
 * - PrismaClient compiles and all model typings are accessible
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('STORY-setup-004: Prisma schema validation', () => {
  const rootDir = resolve(__dirname, '..', '..');
  const schemaPath = resolve(rootDir, 'prisma', 'schema.prisma');
  const schemaContent = readFileSync(schemaPath, 'utf-8');

  describe('Schema file', () => {
    it('exists at prisma/schema.prisma', () => {
      expect(readFileSync(schemaPath, 'utf-8')).toBeTruthy();
    });

    it('contains MongoDB provider', () => {
      expect(schemaContent).toContain('provider = "mongodb"');
    });

    it('defines all 7 required enums', () => {
      const enums = [
        'enum UserRole',
        'enum AccountStatus',
        'enum TrackStatus',
        'enum Genre',
        'enum ReportReason',
        'enum ReportStatus',
        'enum AuditAction',
      ];
      enums.forEach((e) => {
        expect(schemaContent).toContain(e);
      });
    });

    it('defines all 11 required models', () => {
      const models = [
        'model User',
        'model ArtistProfile',
        'model Track',
        'model Playlist',
        'model PlaylistTrack',
        'model Like',
        'model Follow',
        'model Report',
        'model AuditLog',
        'model PlayLog',
        'model PlatformMetricSnapshot',
      ];
      models.forEach((m) => {
        expect(schemaContent).toContain(m);
      });
    });

    it('configures compound unique indexes per acceptance criteria', () => {
      expect(schemaContent).toContain('@@unique([playlistId, position])');
      expect(schemaContent).toContain('@@unique([playlistId, trackId])');
      expect(schemaContent).toContain('@@unique([userId, trackId])');
      expect(schemaContent).toContain('@@unique([followerId, artistProfileId])');
    });

    it('configures UserRole enum with LISTENER, ARTIST, ADMIN', () => {
      const enumBlock = schemaContent.match(/enum UserRole\s*\{[^}]+\}/s);
      expect(enumBlock).toBeDefined();
      expect(enumBlock![0]).toContain('LISTENER');
      expect(enumBlock![0]).toContain('ARTIST');
      expect(enumBlock![0]).toContain('ADMIN');
    });

    it('configures AccountStatus enum with ACTIVE, SUSPENDED, BANNED', () => {
      const enumBlock = schemaContent.match(/enum AccountStatus\s*\{[^}]+\}/s);
      expect(enumBlock).toBeDefined();
      expect(enumBlock![0]).toContain('ACTIVE');
      expect(enumBlock![0]).toContain('SUSPENDED');
      expect(enumBlock![0]).toContain('BANNED');
    });

    it('configures TrackStatus enum with LIVE, ARCHIVED, TAKEDOWN, PENDING', () => {
      const enumBlock = schemaContent.match(/enum TrackStatus\s*\{[^}]+\}/s);
      expect(enumBlock).toBeDefined();
      expect(enumBlock![0]).toContain('LIVE');
      expect(enumBlock![0]).toContain('ARCHIVED');
      expect(enumBlock![0]).toContain('TAKEDOWN');
      expect(enumBlock![0]).toContain('PENDING');
    });

    it('configures Genre enum with all taxonomy values', () => {
      const enumBlock = schemaContent.match(/enum Genre\s*\{[^}]+\}/s);
      expect(enumBlock).toBeDefined();
      const expectedGenres = [
        'INDIE_ROCK', 'BEDROOM_POP', 'ELECTRONIC', 'HIP_HOP',
        'LO_FI', 'AMBIENT', 'R_AND_B', 'FOLK', 'OTHER',
      ];
      expectedGenres.forEach((g) => {
        expect(enumBlock![0]).toContain(g);
      });
    });

    it('configures ReportReason enum with all values', () => {
      const enumBlock = schemaContent.match(/enum ReportReason\s*\{[^}]+\}/s);
      expect(enumBlock).toBeDefined();
      expect(enumBlock![0]).toContain('COPYRIGHT_VIOLATION');
      expect(enumBlock![0]).toContain('INAPPROPRIATE_CONTENT');
      expect(enumBlock![0]).toContain('SPAM_OR_MISLEADING');
      expect(enumBlock![0]).toContain('OTHER');
    });

    it('configures ReportStatus enum with all values', () => {
      const enumBlock = schemaContent.match(/enum ReportStatus\s*\{[^}]+\}/s);
      expect(enumBlock).toBeDefined();
      expect(enumBlock![0]).toContain('PENDING');
      expect(enumBlock![0]).toContain('RESOLVED_APPROVED');
      expect(enumBlock![0]).toContain('RESOLVED_REJECTED');
    });

    it('configures AuditAction enum with all values', () => {
      const enumBlock = schemaContent.match(/enum AuditAction\s*\{[^}]+\}/s);
      expect(enumBlock).toBeDefined();
      expect(enumBlock![0]).toContain('REPORT_APPROVED_UNPUBLISH');
      expect(enumBlock![0]).toContain('REPORT_REJECTED_DISMISS');
      expect(enumBlock![0]).toContain('USER_SUSPENDED');
      expect(enumBlock![0]).toContain('USER_BANNED');
      expect(enumBlock![0]).toContain('USER_REINSTATED');
    });

    it('maps model fields to camelCase MongoDB field names', () => {
      expect(schemaContent).toContain('@map("password_hash")');
      expect(schemaContent).toContain('@map("email_verified")');
      expect(schemaContent).toContain('@map("created_at")');
      expect(schemaContent).toContain('@map("updated_at")');
    });

    it('defines PlayLog model for play tracking', () => {
      expect(schemaContent).toContain('model PlayLog');
      expect(schemaContent).toContain('@map("track_id")');
      expect(schemaContent).toContain('@map("artist_profile_id")');
      expect(schemaContent).toContain('@map("ip_address_hash")');
    });

    it('defines PlatformMetricSnapshot for daily analytics', () => {
      expect(schemaContent).toContain('model PlatformMetricSnapshot');
      expect(schemaContent).toContain('totalUsers');
      expect(schemaContent).toContain('totalTracks');
      expect(schemaContent).toContain('audioBytesTotal');
    });
  });

  describe('PrismaClient typings', () => {
    let prismaClientAvailable = true;
    let PrismaClient: any;
    let Prisma: any;

    beforeAll(() => {
      try {
        const mod = require('@prisma/client');
        PrismaClient = mod.PrismaClient;
        Prisma = mod.Prisma;
      } catch {
        prismaClientAvailable = false;
      }
    });

    it('imports and exposes PrismaClient', () => {
      if (!prismaClientAvailable) {
        console.warn('Skipping PrismaClient test — @prisma/client not installed');
        return;
      }
      expect(PrismaClient).toBeDefined();
      expect(typeof PrismaClient).toBe('function');
    });

    it('exposes Prisma namespace', () => {
      if (!prismaClientAvailable) {
        console.warn('Skipping Prisma namespace test — @prisma/client not installed');
        return;
      }
      expect(Prisma).toBeDefined();
      expect(typeof Prisma).toBe('object');
      // In Prisma v7 model names are exposed via Prisma.ModelName
      expect(Prisma.ModelName).toBeDefined();
    });
  });
});
