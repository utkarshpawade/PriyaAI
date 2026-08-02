import { budgetOvershoot, formatInrCompact, isWithinBudget, type Configuration } from '@rvagent/shared';
import { aurevaSkyline } from './aureva-skyline.js';
import { meridianVerde } from './meridian-verde.js';
import { projectSchema, type InventoryUnit, type KbTopic, type Project } from './schema.js';

export * from './schema.js';

/** The compiled, immutable knowledge base. `/admin` layers overrides on top. */
const BASE_PROJECTS: readonly Project[] = Object.freeze([aurevaSkyline, meridianVerde]);

/** The project the agent pitches by default. */
export const PRIMARY_PROJECT_SLUG = aurevaSkyline.slug;

export function baseProjects(): readonly Project[] {
  return BASE_PROJECTS;
}

/**
 * A sparse, slug-keyed patch produced by the /admin editor. Deliberately typed
 * as `unknown` at the boundary: it arrives as JSON from a database column, and
 * the only thing that makes it safe is re-validating the merge result.
 */
export type KbOverrides = Record<string, unknown>;

/**
 * Merges admin overrides over the compiled KB and re-validates.
 *
 * Re-parsing with zod is the whole point: a live edit during a demo can change
 * a price or a possession date, but it cannot produce a project object the rest
 * of the agent would choke on. An invalid patch throws and the caller keeps the
 * previous version.
 */
export function applyKbOverrides(overrides: KbOverrides | null | undefined): Project[] {
  if (!overrides || Object.keys(overrides).length === 0) {
    return BASE_PROJECTS.map((project) => project);
  }
  return BASE_PROJECTS.map((project) => {
    const patch = overrides[project.slug];
    if (!isPlainObject(patch)) return project;
    return projectSchema.parse(deepMerge(project, patch));
  });
}

export function findProject(projects: readonly Project[], slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug);
}

export function primaryProject(projects: readonly Project[]): Project {
  return findProject(projects, PRIMARY_PROJECT_SLUG) ?? projects[0];
}

/**
 * Matches a caller's spoken locality against project localities and aliases.
 * Returns every match so "Pune" surfaces both projects while "Kharadi" narrows
 * to one.
 */
export function findProjectsByLocation(
  projects: readonly Project[],
  spokenLocation: string,
): Project[] {
  const needle = spokenLocation.trim().toLowerCase();
  if (needle.length === 0) return [];

  return projects.filter((project) => {
    const haystack = [
      project.location.locality,
      project.location.city,
      project.name,
      ...project.location.aliases,
    ].map((value) => value.toLowerCase());
    return haystack.some((value) => value.includes(needle) || needle.includes(value));
  });
}

export interface TopicFacts {
  topic: KbTopic;
  project: string;
  slug: string;
  facts: Record<string, unknown>;
  /** Compliance framing the agent must carry into its phrasing. */
  disclaimer: string;
}

const PRICE_DISCLAIMER = 'All prices are indicative and subject to availability.';
const TIMELINE_DISCLAIMER =
  'Timelines are expected dates as per the current construction plan, not guarantees.';
const GENERAL_DISCLAIMER = 'Details are as per current project information and may be updated.';

/**
 * The single grounded lookup behind the `get_project_info` tool.
 *
 * Returns structured facts rather than prose so the LLM can phrase them in the
 * caller's language without being handed sentences it might edit into a claim
 * the KB does not support.
 */
export function lookupTopic(project: Project, topic: KbTopic): TopicFacts {
  const base = { topic, project: project.name, slug: project.slug };

  switch (topic) {
    case 'price':
      return {
        ...base,
        disclaimer: PRICE_DISCLAIMER,
        facts: {
          configurations: project.configurations.map((config) => ({
            configuration: config.configuration,
            label: config.label,
            carpetAreaSqft: config.carpetAreaSqft,
            priceBand: `${formatInrCompact(config.priceBandInr[0])} – ${formatInrCompact(config.priceBandInr[1])}`,
            priceBandInr: config.priceBandInr,
          })),
          extraCharges: project.charges,
        },
      };

    case 'amenities':
      return {
        ...base,
        disclaimer: GENERAL_DISCLAIMER,
        facts: { count: project.amenities.length, amenities: project.amenities },
      };

    case 'possession':
      return { ...base, disclaimer: TIMELINE_DISCLAIMER, facts: { ...project.possession } };

    case 'connectivity':
      return {
        ...base,
        disclaimer: GENERAL_DISCLAIMER,
        facts: { location: project.location, nearby: project.connectivity },
      };

    case 'approvals':
      return {
        ...base,
        disclaimer: `${GENERAL_DISCLAIMER} ${project.reraNote}`,
        facts: { reraId: project.reraId, approvals: project.approvals },
      };

    case 'payment_plan':
      return {
        ...base,
        disclaimer: PRICE_DISCLAIMER,
        facts: { plans: project.paymentPlans, bankTieUps: project.bankTieUps },
      };

    case 'floor_plans':
      return {
        ...base,
        disclaimer: GENERAL_DISCLAIMER,
        facts: {
          configurations: project.configurations.map((config) => ({
            configuration: config.configuration,
            label: config.label,
            carpetAreaSqft: config.carpetAreaSqft,
            bathrooms: config.bathrooms,
            balconies: config.balconies,
            note: config.floorPlanNote,
          })),
        },
      };

    case 'location':
      return {
        ...base,
        disclaimer: GENERAL_DISCLAIMER,
        facts: { location: project.location, highlights: project.highlights },
      };

    case 'developer':
      return {
        ...base,
        disclaimer: GENERAL_DISCLAIMER,
        facts: { developer: project.developer, note: project.developerNote, reraId: project.reraId },
      };

    case 'charges':
      return { ...base, disclaimer: PRICE_DISCLAIMER, facts: { ...project.charges } };

    case 'overview':
      return {
        ...base,
        disclaimer: `${PRICE_DISCLAIMER} ${TIMELINE_DISCLAIMER}`,
        facts: {
          positioning: project.positioning,
          scale: project.scale,
          location: `${project.location.locality}, ${project.location.city}`,
          possession: project.possession.expectedDate,
          configurations: project.configurations.map((config) => config.label),
          highlights: project.highlights,
        },
      };
  }
}

/** Keyword search over every project's FAQ, used to ground off-script questions. */
export function searchFaq(projects: readonly Project[], query: string, limit = 3) {
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((term) => term.length > 3);
  if (terms.length === 0) return [];

  return projects
    .flatMap((project) =>
      project.faq.map((entry) => {
        const haystack = `${entry.question} ${entry.answer}`.toLowerCase();
        const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
        return { project: project.name, slug: project.slug, ...entry, score };
      }),
    )
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export interface MatchingUnitsQuery {
  configuration?: Configuration | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  projectSlug?: string | null;
}

export interface MatchedUnit {
  project: string;
  slug: string;
  unit: InventoryUnit;
  priceLabel: string;
  /** 0 for an in-budget unit; 0.08 means 8% above the caller's ceiling. */
  overshoot: number;
}

export interface MatchingUnitsResult {
  matches: MatchedUnit[];
  alternatives: MatchedUnit[];
  /** Honest framing the agent must reuse verbatim when offering alternatives. */
  note: string;
}

/**
 * Inventory search with an honest fallback.
 *
 * When nothing fits, we return the *nearest* units and say plainly that they
 * sit above the stated budget. Silently widening the budget and presenting the
 * result as a match is exactly the pushy-broker behaviour the guardrails ban.
 */
export function findMatchingUnits(
  projects: readonly Project[],
  query: MatchingUnitsQuery,
): MatchingUnitsResult {
  const pool = projects
    .filter((project) => !query.projectSlug || project.slug === query.projectSlug)
    .flatMap((project) =>
      project.inventory
        .filter((unit) => unit.status === 'available')
        .map((unit) => ({ project: project.name, slug: project.slug, unit })),
    );

  const byConfiguration = query.configuration
    ? pool.filter((entry) => entry.unit.configuration === query.configuration)
    : pool;

  const decorate = (entry: (typeof pool)[number]): MatchedUnit => ({
    ...entry,
    priceLabel: formatInrCompact(entry.unit.priceInr),
    overshoot: budgetOvershoot(entry.unit.priceInr, query.budgetMin, query.budgetMax),
  });

  const matches = byConfiguration
    .filter((entry) => isWithinBudget(entry.unit.priceInr, query.budgetMin, query.budgetMax))
    .map(decorate)
    .sort((a, b) => a.unit.priceInr - b.unit.priceInr)
    .slice(0, 5);

  if (matches.length > 0) {
    return { matches, alternatives: [], note: 'Units matched the stated configuration and budget.' };
  }

  // Nothing fits: offer the closest units in the same configuration first, then
  // relax the configuration if that pool is empty too.
  const fallbackPool = byConfiguration.length > 0 ? byConfiguration : pool;
  const alternatives = fallbackPool
    .map(decorate)
    .sort((a, b) => a.overshoot - b.overshoot || a.unit.priceInr - b.unit.priceInr)
    .slice(0, 3);

  const relaxedConfiguration = byConfiguration.length === 0 && Boolean(query.configuration);
  const note = relaxedConfiguration
    ? 'No unit matches that configuration. These are the nearest options in other configurations — say so plainly.'
    : 'Nothing is available inside that budget. These are the nearest units and they are above the stated range — say so plainly before describing them.';

  return { matches: [], alternatives, note };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Arrays replace wholesale; objects merge key by key. */
function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    result[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return result;
}
