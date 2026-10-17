import { runtime } from '#lib/server/ayudham.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  const { retentionDays, backupRotationDays } = runtime().app.config;
  return { retentionDays, backupRotationDays };
};
