import { runtime } from '#lib/server/pokerji.ts';
import type { LayoutServerLoad } from './$types';

/** The retention period is stated on several pages; they all read it from here. */
export const load: LayoutServerLoad = () => ({
  retentionDays: runtime().app.config.retentionDays,
});
