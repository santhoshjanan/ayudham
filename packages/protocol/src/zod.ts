import { z } from 'zod';

// Every schema in this package is made through this module, so this runs before the first one.
// Without it zod probes for `Function` when it builds an object schema, and under the site's
// Content Security Policy (no 'unsafe-eval') that probe is reported as a violation on every page.
z.config({ jitless: true });

export { z };
