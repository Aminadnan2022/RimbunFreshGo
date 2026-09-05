/**
 * The residence names below mirror the canonical normal-bulk delivery zones
 * seeded in 20260916000000_phase4a_canonical_payment_delivery_notifications.sql.
 * Keep address aliases explicit: a road name by itself is never sufficient.
 */
export const COMMUNITY_RESIDENCES = [
  {
    zoneCode: 'residensi_rimbun',
    aliases: ['residensi rimbun', 'rimbun residence'],
    contextualAliases: [
      {
        phrase: 'canopy hills',
        contexts: ['jalan zamrud utama', 'jalan zamrud 2'],
      },
      {
        phrase: 'canopy hill residence',
        contexts: ['jalan zamrud utama', 'jalan zamrud 2'],
      },
    ],
  },
  {
    zoneCode: 'residensi_mutiara',
    aliases: ['residensi mutiara', 'mutiara residence'],
  },
  {
    zoneCode: 'residensi_emas',
    aliases: ['residensi emas', 'emas residence'],
  },
  {
    zoneCode: 'residensi_jed',
    aliases: ['residensi jed', 'jed residence'],
  },
  {
    zoneCode: 'residensi_parkland',
    aliases: ['residensi parkland', 'parkland residence'],
  },
  {
    zoneCode: 'residensi_zamrud',
    aliases: ['residensi zamrud', 'zamrud residence'],
  },
] as const;

export type CommunityResidence = (typeof COMMUNITY_RESIDENCES)[number];

type ContextualAlias = {
  phrase: string;
  contexts: readonly string[];
};

function normalizeAddress(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function containsPhrase(value: string, phrase: string): boolean {
  const normalizedValue = ` ${normalizeAddress(value)} `;
  const normalizedPhrase = normalizeAddress(phrase);
  return normalizedPhrase.length > 0 && normalizedValue.includes(` ${normalizedPhrase} `);
}

function matchesContextualAlias(value: string, alias: ContextualAlias): boolean {
  return containsPhrase(value, alias.phrase) && alias.contexts.some((context) => containsPhrase(value, context));
}

/** Return the listed community residence represented by one or more address labels. */
export function communityResidenceFromAddress(...addresses: string[]): CommunityResidence | null {
  const addressText = addresses.join(' ');
  const matchesResidence = (residence: CommunityResidence): boolean => {
    const contextualAliases = 'contextualAliases' in residence ? residence.contextualAliases : [];
    return residence.aliases.some((alias) => containsPhrase(addressText, alias)) ||
      contextualAliases.some((alias) => matchesContextualAlias(addressText, alias));
  };
  return COMMUNITY_RESIDENCES.find((residence) =>
    matchesResidence(residence),
  ) ?? null;
}

/** Address eligibility used by the homepage checker. */
export function isCommunityResidenceAddress(...addresses: string[]): boolean {
  return communityResidenceFromAddress(...addresses) !== null;
}
