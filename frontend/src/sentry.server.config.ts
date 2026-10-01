// PLAN_HARDENING P5 - Sentry phía server của Next (route handler, server component, proxy).
import * as Sentry from '@sentry/nextjs';
import { buildSentryOptions } from '@/lib/observability/sentry-options';

Sentry.init(buildSentryOptions());
