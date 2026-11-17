// Shared screening-question answers for every form filler.
// setup/render.py pastes this file in place of __ANSWERS__, so each built filler gets the same rules.
// Tests: node tests/answers.test.js (real question wordings and the answer each must get).
//
// answerFor(label, P) returns one of:
//   { pick: RegExp, why }  the option to choose, with the profile field it came from
//   { stop: reason }       a question the candidate must answer (or approve) themselves
//   null                   not a shared question; the filler may use its own site rules (EEO, country, ...)
//
// Every answer comes from config/profile.json. A missing answer is a stop, never a guess.
const answerFor = (label, P) => {
  // Match on the question only: helper text after the last "?" ("Note: we are unable to sponsor visas.") must not flip it.
  const q = String(label || '')
    .replace(/\s+/g, ' ')
    .replace(/\?[^?]*$/, '?');
  const A = P.answers || {};
  const C = P.consents || {};
  const yn = (v, key) =>
    v === true || /^yes$/i.test(v)
      ? { pick: /^Yes\b/i, why: key }
      : v === false || /^no$/i.test(v)
        ? { pick: /^No\b/i, why: key }
        : { stop: `no answer in profile (${key})` };
  const has = (re) => re.test(q);
  // Sponsorship now vs later (OPT, STEM OPT and H-4 EAD are authorized now but need sponsorship later).
  // Older profiles only have needs_sponsorship: read it as both.
  const WA = P.work_auth || {};
  const spNow = WA.sponsorship_now ?? WA.needs_sponsorship;
  const spFuture = WA.sponsorship_future ?? WA.needs_sponsorship;
  const spAny = spNow === undefined && spFuture === undefined ? undefined : !!(spNow || spFuture);
  const notAny = spAny === undefined ? undefined : !spAny;

  // 1. Work authorization. "without" flips the meaning, so it is handled before anything else.
  if (
    has(
      /sponsor|visa|immigration|unrestricted|work (authori[sz]ation|permit)|authori[sz]ed to work|eligible to work|right to work|legally (able|authori[sz]ed|eligible|entitled|permitted)/i,
    )
  ) {
    if (has(/with or without/i)) return { stop: 'work-auth question says "with or without"; read it yourself' };
    if (has(/\bwithout\b/i)) {
      // "Are you authorized / able / eligible to work ... without sponsorship?" -> true only if no sponsorship is needed.
      if (
        has(/(authori[sz]ed|able|eligible|permitted|legally entitled) to (work|be employed)/i) &&
        has(/without[^?.]{0,60}(sponsor|visa|immigration)/i)
      )
        return yn(notAny, 'work_auth.sponsorship_now/future (inverted: "without")');
      return { stop: 'work-auth question with "without" in an unknown shape' };
    }
    if (has(/type of (visa|sponsorship)|visa type|current visa|immigration status|work authori[sz]ation (type|status)/i))
      return WA.visa_type
        ? { pick: new RegExp(WA.visa_type.replace('-', '-?'), 'i'), why: 'work_auth.visa_type' }
        : { stop: 'no answer in profile (work_auth.visa_type)' };
    if (
      has(
        /sponsor|employer support to obtain|require (employer|company) support|immigration (support|sponsorship|benefit)|(require|need) (a )?(work )?visa/i,
      )
    )
      // "currently / right now / at this time" without "future" asks about today only.
      return has(/\b(currently|right now|at this time)\b/i) && !has(/future/i)
        ? yn(spNow, 'work_auth.sponsorship_now')
        : yn(spAny, 'work_auth.sponsorship_now/future');
    if (has(/unrestricted/i)) return yn(notAny, 'work_auth.sponsorship_now/future (unrestricted = no sponsorship)');
    if (has(/legally (able|authori[sz]ed|eligible|entitled|permitted)|authori[sz]ed to work|eligible to work|right to work/i))
      return yn(P.work_auth.authorized_us, 'work_auth.authorized_us');
  }

  // 2. AI. The employer's own AI review is a consent from the profile; any other mention of AI stops,
  // whatever the verb ("I acknowledge ... I did not use AI tools" must never be auto-signed).
  if (has(/automated tools such as AI|AI to (support|assist) (the )?review|use of AI in (the )?(hiring|recruit)/i))
    return yn(A.employer_ai_review_consent, 'answers.employer_ai_review_consent');
  if (has(/\bAI\b|artificial intelligence|generative|chatgpt|language model/i))
    return { stop: 'mentions AI use; the candidate answers this' };

  // Statements the candidate signs.
  if (has(/arbitration/i))
    return C.arbitration
      ? { pick: /^(Yes|I agree|I acknowledge|Acknowledge)/i, why: 'consents.arbitration' }
      : { stop: 'arbitration agreement; consents.arbitration is not true' };

  // 3. Fixed facts about the candidate (all from profile.answers).
  const facts = [
    [
      /non-?compete|non-?solicit|restrictive covenant|post-employment restriction|subject to any agreement|agreement.{0,40}(restrict|preclude|prevent)/i,
      'restrictive_agreement',
    ],
    [
      /(previously|ever|before).{0,30}(employed|worked)|(worked|been employed) (for|at|with) .{0,60}(before|previously|in the past)|former employee|current or former employee|have you worked (at|for)/i,
      'previously_employed_here',
    ],
    [/currently employed by|are you (a )?current(ly)? (an )?employee|current employee of/i, 'current_employee_here'],
    [
      /senior government official|public official|government official|government (employee|entity)|post-government/i,
      'government_official',
    ],
    [/debarred|suspended|excluded from (federal|government)/i, 'debarred'],
    [
      /related to (anyone|someone|a current|an? (current )?employee)|\brelatives?\b|close personal relationship|family (member|relationship)/i,
      'relatives_employed',
    ],
    [
      /outside (employment|business|activit)|board (member|seat)|advisory board|business interest|conflict of interest/i,
      'outside_business',
    ],
    [/(citizen|national).{0,40}(cuba|iran|north korea|syria)/i, 'sanctioned_country_citizen'],
    [/18 years|age of 18|at least 18/i, 'over_18'],
    [
      /military family|military spouse|national guard|reserves|armed forces|military service|served in the (u\.?s\.? )?military/i,
      'military_service',
    ], // veteran STATUS is EEO, handled by the filler
    [/contract(ed)? worker|assigned to work at .{0,40} as a contract/i, 'contractor_here'],
    [/enterprise software/i, 'enterprise_software'],
    [/background check|drug (test|screen)/i, 'background_check_ok'],
    [/verif(y|ication of) (your )?identity|I-9/i, 'can_complete_i9'],
    [/text message|\bsms\b/i, 'sms_opt_in'],
    [/future (positions|opportunities)|contact me about/i, 'future_contact_opt_in'],
    [/privacy (notice|policy|statement)/i, 'privacy_ack'],
    [/relocat/i, 'open_to_relocate'],
    [/hybrid|in[- ]office|on-?site|in-person|commut/i, 'open_to_onsite'],
  ];
  // Relocating at your own expense is a money question for the candidate, not open_to_relocate.
  if (has(/relocat[\s\S]{0,60}(own expense|own cost|at your expense|self-?funded)/i))
    return { stop: 'relocation at your own expense; the candidate answers this' };
  for (const [re, key] of facts)
    if (has(re)) {
      const v = key === 'open_to_relocate' ? P.open_to_relocate : key === 'open_to_onsite' ? P.open_to_onsite : A[key];
      return yn(v, key === 'open_to_relocate' || key === 'open_to_onsite' ? key : 'answers.' + key);
    }

  // 4. Job-specific claims are never auto-answered: they depend on the role and the candidate's real experience.
  if (
    has(
      /(experience|proficien|familiar).{0,60}(required|specific|this) (tech(nology)? )?stack|specific language or tech stack|experience (with|working with) the (specific|required)/i,
    )
  )
    return { stop: 'tech-stack experience claim; check the job description against confirmed skills' };

  // 5. Generic acknowledgements: only ones the candidate listed in answers.acknowledge_ok.
  if (has(/acknowledge|certify|attest|i agree|consent|understand|terms and conditions|e-?signature|electronic signature/i)) {
    if (A.acknowledge_ok && new RegExp(A.acknowledge_ok, 'i').test(q))
      return { pick: /^(Yes|I agree|I acknowledge|Acknowledge|I understand|Opt-In)/i, why: 'answers.acknowledge_ok' };
    return { stop: 'legal acknowledgement not in answers.acknowledge_ok' };
  }
  return null;
};

// Free-text questions (Workday). Rules are anchored to the start of the label so "capacity" is not a city,
// "statement" is not a state, and "experience with compensation systems" is not a salary question.
// Labels over ~80 characters are essay prompts: always the candidate's (or a drafted, checked) answer.
// Returns { text, why } | { stop } | null (null = unknown; the filler stops).
const textAnswerFor = (label, P) => {
  const q = String(label || '')
    .replace(/\s+/g, ' ')
    .replace(/\*$/, '')
    .trim();
  if (q.length > 80) return { stop: 'long free-text prompt (essay); draft it from confirmed facts and check it' };
  const lead =
    '^(?:(?:what|when) (?:is|are|can|will) (?:your|you) |please (?:provide|enter|list|share) (?:your )?|your |(?:desired|expected) )?';
  const R = (s) => new RegExp(lead + s, 'i');
  const rules = [
    [
      R('(?:details on your (?:required )?sponsorship|explain(?: your)? sponsorship|sponsorship (?:details|required))'),
      P.work_auth.sponsorship_details,
      'work_auth.sponsorship_details',
    ],
    [R('(?:salary|compensation|pay)(?: expectations?| requirements?| range)?\\b'), P.salary_text, 'salary_text'],
    [
      R('(?:notice period|(?:earliest |desired )?start date|available to start|availability to start|start\\??$)'),
      P.notice_long,
      'notice_long',
    ],
    [
      R('(?:current )?(?:visa|immigration|work authori[sz]ation) status'),
      P.work_auth.visa_status_text,
      'work_auth.visa_status_text',
    ],
    [/^city\b/i, P.address.city, 'address.city'],
    [/^(state|province)\b/i, P.address.state, 'address.state'],
    [
      R('(?:location preference|preferred (?:office|location|geographic location))'),
      P.location_preference,
      'location_preference',
    ],
    [R('linkedin'), P.links.linkedin, 'links.linkedin'],
    [R('(?:how did you )?hear about'), P.how_heard, 'how_heard'],
  ];
  for (const [re, v, why] of rules) if (re.test(q)) return v ? { text: v, why } : { stop: `no answer in profile (${why})` };
  return null;
};

// Match a resume-parsed job or degree to the profile. When the same employer appears more than once,
// only an exact title match counts (substring matching gave "Software Engineer" the "Software Engineer II" text).
// null = no safe match; the filler stops.
const normText = (x) =>
  String(x || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const nearText = (a, b) => {
  a = normText(a);
  b = normText(b);
  return !!a && !!b && (a.includes(b) || b.includes(a));
};
const eqText = (a, b) => !!normText(a) && normText(a) === normText(b);
const matchWorkHistory = (list, co, title) => {
  const pool = (list || []).filter((w) => nearText(w.employer, co));
  return pool.length === 1 ? pool[0] : pool.find((w) => eqText(w.title, title)) || null;
};
const matchEducation = (list, school) => {
  const pool = (list || []).filter((e) => nearText(e.school, school));
  if (pool.length === 1) return pool[0];
  const exact = pool.filter((e) => eqText(e.school, school));
  return exact.length === 1 ? exact[0] : null;
};
