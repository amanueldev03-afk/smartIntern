import sequelize from '../config/database.js';

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren', 'arent',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can',
  'cannot', 'could', 'couldnt', 'did', 'didn', 'didnt', 'do', 'does', 'doesn', 'doesnt', 'doing', 'dont',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 'havent',
  'having', 'he', 'hed', 'hell', 'hes', 'her', 'here', 'heres', 'hers', 'herself', 'him', 'himself', 'his',
  'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is', 'isnt', 'it', 'its', 'itself',
  'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once',
  'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shant', 'she',
  'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such', 'than', 'that', 'thats', 'the',
  'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these', 'they', 'theyd', 'theyll',
  'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
  'wasnt', 'we', 'wed', 'well', 'were', 'werent', 'weve', 'what', 'whats', 'when', 'whens', 'where',
  'wheres', 'which', 'while', 'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt',
  'you', 'youd', 'youll', 'youre', 'youve', 'your', 'yours', 'yourself', 'yourselves'
]);

export const PLAGIARISM_THRESHOLD_PCT = 75.0;

/**
 * Tokenize text into words, stripping punctuation and lowercase.
 */
function tokenize(text) {
  if (!text) return [];
  const words = text.toLowerCase().match(/[a-z0-9_]+/g) || [];
  return words;
}

/**
 * Extract unigrams, bigrams, and trigrams from words, excluding pure stop-word tokens.
 */
function extractNgrams(words, minN = 1, maxN = 3) {
  const ngrams = [];
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i <= words.length - n; i++) {
      const slice = words.slice(i, i + n);
      // Skip if all words in the slice are stop words
      if (slice.every(w => STOP_WORDS.has(w))) continue;
      ngrams.push(slice.join(' '));
    }
  }
  return ngrams;
}

/**
 * Compute Term Frequency map: term -> frequency
 */
function computeTf(ngrams) {
  const tf = {};
  if (ngrams.length === 0) return tf;
  for (const term of ngrams) {
    tf[term] = (tf[term] || 0) + 1;
  }
  for (const term in tf) {
    tf[term] = tf[term] / ngrams.length;
  }
  return tf;
}

/**
 * Compute Cosine Similarity between two TF-IDF vector maps
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const term in vecA) {
    normA += vecA[term] * vecA[term];
    if (term in vecB) {
      dotProduct += vecA[term] * vecB[term];
    }
  }

  for (const term in vecB) {
    normB += vecB[term] * vecB[term];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Check candidate weekly logbook text against historical archives of approved logbooks.
 *
 * @param {string} newText - The logbook text to check.
 * @param {string} studentId - The student ID.
 * @param {number|null} weekNumber - Optional week number.
 * @param {string|null} logbookId - Optional current logbook ID to exclude.
 * @returns {Promise<{ similarity_score: number, is_flagged: boolean, matched_snippet: string }>}
 */
export async function checkLogbookPlagiarism(newText, studentId, weekNumber = null, logbookId = null) {
  if (!newText || typeof newText !== 'string' || !newText.trim()) {
    return {
      similarity_score: 0.0,
      is_flagged: false,
      matched_snippet: '',
    };
  }

  const candidateText = newText.trim();
  const candidateWords = tokenize(candidateText);
  const candidateNgrams = extractNgrams(candidateWords, 1, 3);

  if (candidateNgrams.length === 0) {
    return {
      similarity_score: 0.0,
      is_flagged: false,
      matched_snippet: '',
    };
  }

  // Query historical logbooks
  let corpus = [];
  try {
    let query = `
      SELECT id, tasks_executed
      FROM projects_weeklylogbook
      WHERE advisor_approved = true
    `;
    const replacements = [];

    if (logbookId) {
      replacements.push(logbookId);
      query += ` AND id != $${replacements.length}`;
    }

    if (studentId && weekNumber !== null && weekNumber !== undefined) {
      replacements.push(studentId);
      replacements.push(weekNumber);
      query += ` AND NOT (student_id = $${replacements.length - 1} AND week_number = $${replacements.length})`;
    }

    const rows = await sequelize.query(query, {
      bind: replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    for (const row of rows) {
      const text = (row.tasks_executed || '').trim();
      if (text.length > 10) {
        corpus.push({ id: row.id, text });
      }
    }
  } catch (err) {
    console.warn('[PlagiarismChecker] Error querying historical corpus:', err.message);
  }

  if (corpus.length === 0) {
    return {
      similarity_score: 0.0,
      is_flagged: false,
      matched_snippet: '',
    };
  }

  // Build document frequency (DF) for IDF calculation
  const allDocsNgrams = [candidateNgrams, ...corpus.map(c => extractNgrams(tokenize(c.text), 1, 3))];
  const docCount = allDocsNgrams.length;
  const df = {};

  for (const docNgrams of allDocsNgrams) {
    const uniqueTerms = new Set(docNgrams);
    for (const term of uniqueTerms) {
      df[term] = (df[term] || 0) + 1;
    }
  }

  // IDF helper: smooth IDF = log((1 + N) / (1 + df)) + 1
  function idf(term) {
    const count = df[term] || 0;
    return Math.log((1 + docCount) / (1 + count)) + 1.0;
  }

  // Candidate TF-IDF vector
  const candidateTf = computeTf(candidateNgrams);
  const candidateVector = {};
  for (const term in candidateTf) {
    candidateVector[term] = candidateTf[term] * idf(term);
  }

  let maxSim = 0.0;
  let bestMatchText = '';

  for (let i = 0; i < corpus.length; i++) {
    const historicalNgrams = allDocsNgrams[i + 1];
    if (historicalNgrams.length === 0) continue;

    const histTf = computeTf(historicalNgrams);
    const histVector = {};
    for (const term in histTf) {
      histVector[term] = histTf[term] * idf(term);
    }

    const sim = cosineSimilarity(candidateVector, histVector);
    if (sim > maxSim) {
      maxSim = sim;
      bestMatchText = corpus[i].text;
    }
  }

  const scorePercentage = Math.round(maxSim * 10000) / 100; // e.g. 84.25
  const isFlagged = scorePercentage >= PLAGIARISM_THRESHOLD_PCT;

  let snippet = '';
  if (bestMatchText) {
    const snippetLen = 300;
    snippet = bestMatchText.slice(0, snippetLen).trim();
    if (bestMatchText.length > snippetLen) snippet += '...';
  }

  return {
    similarity_score: scorePercentage,
    is_flagged: isFlagged,
    matched_snippet: snippet,
  };
}

export default {
  checkLogbookPlagiarism,
  PLAGIARISM_THRESHOLD_PCT,
};
