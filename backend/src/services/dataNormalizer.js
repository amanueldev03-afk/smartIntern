import crypto from 'crypto';
import { Internship, Skill } from '../models/index.js';

export const FUZZY_MATCH_THRESHOLD = 0.85;
export const DEDUPE_FUZZY_THRESHOLD = 0.80;

export const COUNTRIES = {
  'ethiopia': 'Ethiopia',
  'et': 'Ethiopia',
  'kenya': 'Kenya',
  'ke': 'Kenya',
  'nigeria': 'Nigeria',
  'ng': 'Nigeria',
  'ghana': 'Ghana',
  'south africa': 'South Africa',
  'za': 'South Africa',
  'india': 'India',
  'in': 'India',
  'germany': 'Germany',
  'de': 'Germany',
  'france': 'France',
  'fr': 'France',
  'united kingdom': 'United Kingdom',
  'great britain': 'United Kingdom',
  'uk': 'United Kingdom',
  'united states': 'United States',
  'united states of america': 'United States',
  'usa': 'United States',
  'u.s.a.': 'United States',
  'us': 'United States',
  'canada': 'Canada',
  'ca': 'Canada',
  'australia': 'Australia',
  'au': 'Australia',
  'brazil': 'Brazil',
  'br': 'Brazil',
};

export const CITIES = {
  'addis ababa': 'Addis Ababa',
  'addis abeba': 'Addis Ababa',
  'addis': 'Addis Ababa',
  'nairobi': 'Nairobi',
  'lagos': 'Lagos',
  'accra': 'Accra',
  'london': 'London',
  'berlin': 'Berlin',
  'new york': 'New York',
  'new york city': 'New York',
  'nyc': 'New York',
  'san francisco': 'San Francisco',
  'toronto': 'Toronto',
  'mumbai': 'Mumbai',
  'bengaluru': 'Bengaluru',
  'bangalore': 'Bengaluru',
};

/**
 * Trim and collapse whitespace.
 */
export function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

/**
 * SHA-256 fingerprint of title + organization_name + application_url
 */
export function computeContentHash(title, organizationName, applicationUrl) {
  const parts = [
    cleanText(title).toLowerCase(),
    cleanText(organizationName).toLowerCase(),
    cleanText(applicationUrl).toLowerCase(),
  ];
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

/**
 * Strip HTML markup and unescape common HTML entities.
 */
export function stripHtml(text) {
  if (!text) return '';
  return cleanText(
    text
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
  );
}

/**
 * Simple Levenshtein distance similarity ratio (0.0 to 1.0)
 */
export function stringSimilarity(s1, s2) {
  const str1 = cleanText(s1).toLowerCase();
  const str2 = cleanText(s2).toLowerCase();
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  const track = Array(str2.length + 1).fill(null).map(() =>
    Array(str1.length + 1).fill(null)
  );
  for (let i = 0; i <= str1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= str2.length; j += 1) track[j][0] = j;

  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  const distance = track[str2.length][str1.length];
  const maxLen = Math.max(str1.length, str2.length);
  return 1.0 - (distance / maxLen);
}

/**
 * Standardize location strings into country, city, and location_text.
 */
export function standardizeLocation(countryRaw = '', cityRaw = '', locationTextRaw = '') {
  let country = cleanText(countryRaw);
  let city = cleanText(cityRaw);
  let locationText = cleanText(locationTextRaw);

  let combined = locationText;
  if (!combined && city.includes(',')) combined = city;
  if (!combined && country.includes(',')) combined = country;

  if (combined) {
    const parts = combined.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].toLowerCase();
      country = COUNTRIES[last] || parts[parts.length - 1];
      city = parts[0];
    }
  }

  const countryKey = country.toLowerCase();
  if (COUNTRIES[countryKey]) country = COUNTRIES[countryKey];

  const cityKey = city.toLowerCase();
  if (CITIES[cityKey]) city = CITIES[cityKey];

  const displayParts = [city, country].filter(Boolean);
  const standardizedText = displayParts.join(', ');

  return {
    country,
    city,
    location_text: standardizedText || locationText,
  };
}

/**
 * Map skill text onto catalogue Skill rows.
 */
export async function mapSkills(skillTexts = []) {
  const normalizedInputs = Array.isArray(skillTexts)
    ? skillTexts.map(s => cleanText(s)).filter(Boolean)
    : cleanText(skillTexts).split(',').map(s => s.trim()).filter(Boolean);

  let dbSkills = [];
  try {
    dbSkills = await Skill.findAll({ where: { is_active: true } });
  } catch (err) {
    // fallback if table is empty or error
  }

  const byName = new Map();
  dbSkills.forEach(s => byName.set(cleanText(s.name).toLowerCase(), s));

  const matchedNames = [];
  const matchedIds = [];
  const review = [];

  for (const text of normalizedInputs) {
    const key = text.toLowerCase();
    const exact = byName.get(key);

    if (exact) {
      matchedNames.push(exact.name);
      matchedIds.push(exact.id);
      continue;
    }

    let bestSkill = null;
    let bestScore = 0.0;

    for (const skill of dbSkills) {
      const score = stringSimilarity(key, skill.name.toLowerCase());
      if (score > bestScore) {
        bestScore = score;
        bestSkill = skill;
      }
    }

    if (bestSkill && bestScore >= FUZZY_MATCH_THRESHOLD) {
      matchedNames.push(bestSkill.name);
      matchedIds.push(bestSkill.id);
      review.push({
        text,
        matched_skill: bestSkill.name,
        matched_skill_id: bestSkill.id,
        method: 'fuzzy',
        score: Math.round(bestScore * 1000) / 1000,
        low_confidence: true,
      });
    } else {
      review.push({
        text,
        matched_skill: null,
        matched_skill_id: null,
        method: null,
        score: null,
        low_confidence: true,
      });
    }
  }

  return {
    matched_names: matchedNames,
    matched_ids: matchedIds,
    review,
  };
}

/**
 * Normalize an incoming raw listing object into clean schema format.
 */
export async function normalizeListing(raw = {}, sourceType = null) {
  const data = { ...raw };

  for (const key of Object.keys(data)) {
    if (typeof data[key] === 'string') {
      data[key] = cleanText(data[key]);
    }
  }

  data.description = stripHtml(data.description || '');

  if (data.application_url && !data.application_url.startsWith('http://') && !data.application_url.startsWith('https://')) {
    data.application_url = `https://${data.application_url}`;
  }

  if (data.source_url && !data.source_url.startsWith('http://') && !data.source_url.startsWith('https://')) {
    data.source_url = `https://${data.source_url}`;
  }

  const loc = standardizeLocation(data.country, data.city, data.location_text);
  data.country = loc.country;
  data.city = loc.city;
  data.location_text = loc.location_text;

  const skillResult = await mapSkills(data.required_skills || []);
  data.required_skills = skillResult.matched_names;
  data.required_skill_ids = skillResult.matched_ids;
  data.skills_review = skillResult.review;

  data.content_hash = computeContentHash(
    data.title || '',
    data.organization_name || '',
    data.application_url || ''
  );
  data.source_type = sourceType;

  return data;
}

/**
 * Check if an exact duplicate exists by content_hash.
 */
export async function findExactDuplicate(contentHash) {
  if (!contentHash) return null;
  return await Internship.findOne({ where: { content_hash: contentHash } });
}

/**
 * Check for near-duplicate listing from the same organization.
 */
export async function findNearDuplicate(normalized) {
  const title = cleanText(normalized.title);
  const organizationName = cleanText(normalized.organization_name);

  if (!title || !organizationName) return { matched: null, similarityScore: 0.0 };

  const candidates = await Internship.findAll({
    where: { organization_name: organizationName }
  });

  let best = null;
  let bestScore = 0.0;

  for (const candidate of candidates) {
    if (candidate.content_hash === normalized.content_hash) continue;
    const score = stringSimilarity(title, candidate.title || '');
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (bestScore >= DEDUPE_FUZZY_THRESHOLD) {
    return { matched: best, similarityScore: bestScore };
  }

  return { matched: null, similarityScore: 0.0 };
}

export default {
  computeContentHash,
  stripHtml,
  stringSimilarity,
  standardizeLocation,
  mapSkills,
  normalizeListing,
  findExactDuplicate,
  findNearDuplicate,
};
