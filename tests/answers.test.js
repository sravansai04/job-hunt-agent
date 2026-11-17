// Run: node tests/answers.test.js
// Real screening-question wordings seen on Greenhouse, Workday, Ashby, Eightfold and Oracle forms.
// Every case runs against four candidates (citizen, green card, H-1B, OPT). A case's expected answer is
// either one value for all four, or { citizen, gc, h1b, opt }. 'STOP' = the candidate must answer.
const fs = require('fs'),
  path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'automation', 'lib', 'answers.js'), 'utf8');
const { answerFor, textAnswerFor, matchWorkHistory, matchEducation } = new Function(
  src + '\nreturn { answerFor, textAnswerFor, matchWorkHistory, matchEducation };',
)();

const answers = {
  restrictive_agreement: 'No',
  previously_employed_here: 'No',
  current_employee_here: 'No',
  government_official: 'No',
  debarred: 'No',
  relatives_employed: 'No',
  outside_business: 'No',
  sanctioned_country_citizen: 'No',
  over_18: 'Yes',
  military_service: 'No',
  contractor_here: 'No',
  background_check_ok: 'Yes',
  can_complete_i9: 'Yes',
  sms_opt_in: 'Yes',
  future_contact_opt_in: 'Yes',
  privacy_ack: 'Yes',
  employer_ai_review_consent: 'Yes',
  acknowledge_ok: 'information .{0,60}(is|are) (true|accurate|complete)',
};
const base = { open_to_relocate: true, open_to_onsite: true, consents: { arbitration: false }, answers };
const PROFILES = {
  citizen: { ...base, work_auth: { authorized_us: true, sponsorship_now: false, sponsorship_future: false, visa_type: '' } },
  gc: { ...base, work_auth: { authorized_us: true, sponsorship_now: false, sponsorship_future: false, visa_type: '' } },
  h1b: { ...base, work_auth: { authorized_us: true, sponsorship_now: true, sponsorship_future: true, visa_type: 'H-1B' } },
  opt: {
    ...base,
    work_auth: { authorized_us: true, sponsorship_now: false, sponsorship_future: true, visa_type: 'F-1 STEM OPT' },
  },
};
// Shorthands for answers that depend on sponsorship.
const NEEDS_ANY = { citizen: 'No', gc: 'No', h1b: 'Yes', opt: 'Yes' }; // "now or in the future"
const NEEDS_NOW = { citizen: 'No', gc: 'No', h1b: 'Yes', opt: 'No' }; // "currently"
const FREE = { citizen: 'Yes', gc: 'Yes', h1b: 'No', opt: 'No' }; // "authorized WITHOUT sponsorship", "unrestricted"

const cases = [
  // work authorization
  ['Are you legally authorized to work in the United States?', 'Yes'],
  ['Are you legally authorized to work in the US without sponsorship?', FREE],
  ['Are you able to work in the United States without employer sponsorship now or in the future?', FREE],
  ['Are you eligible to work in the U.S. without requiring visa sponsorship?', FREE],
  ['Will you now or in the future require sponsorship for employment visa status (e.g. H-1B)?', NEEDS_ANY],
  [
    "In order to obtain or maintain employment eligibility, will you now or in the future require the company's sponsorship?",
    NEEDS_ANY,
  ],
  ['Do you require immigration support to work in the US?', NEEDS_ANY],
  ['Do you have unrestricted authorization to work in the United States?', FREE],
  ['Do you currently require sponsorship?', NEEDS_NOW],
  ['Do you require visa sponsorship at this time?', NEEDS_NOW],
  ['Do you currently require sponsorship, or will you in the future?', NEEDS_ANY],
  ['Are you authorized to work in the US with or without sponsorship?', 'STOP'],
  ['Can you start work without a visa transfer?', 'STOP'],
  ['What type of visa sponsorship will you require?', { citizen: 'STOP', gc: 'STOP', h1b: 'H-1B', opt: 'F-1 STEM OPT' }],
  // test 5: helper text after the question must not flip the answer
  ['Are you legally authorized to work in the US? Note: we are unable to sponsor visas.', 'Yes'],
  ['Are you authorized to work in the US? Candidates must not require sponsorship now or in the future.', 'Yes'],
  ['Will you require sponsorship? (We do sponsor H-1B transfers.)', NEEDS_ANY],
  // test 1: AI statements stop whatever the verb; the employer's own AI review is a profile consent
  ['I certify that I did not use AI tools to write any part of this application.', 'STOP'],
  ['I acknowledge that all information is true and that I did not use AI tools to prepare it.', 'STOP'],
  ['Have you used generative AI to write your cover letter?', 'STOP'],
  ['I consent to the use of automated tools such as AI to support review of my application.', 'Yes'],
  // certifications and legal agreements
  ['I agree to the mutual arbitration agreement.', 'STOP'],
  ['I acknowledge that the information provided in this application is true and complete.', 'Yes'],
  ['I acknowledge and agree to the Terms and Conditions.', 'STOP'],
  // fixed facts
  ['Have you signed a non-compete or non-disclosure statement which may become an obstacle?', 'No'],
  ['Have you ever worked for Microsoft as a full-time employee, intern or vendor?', 'No'],
  ['Are you currently employed by a Microsoft subsidiary?', 'No'],
  ['Are you at least 18 years of age?', 'Yes'],
  ['Are you willing to relocate?', 'Yes'],
  ['This role is hybrid, 3 days in office. Are you able to commute?', 'Yes'],
  ['Do you have experience developing enterprise software?', 'STOP'],
  ['Do you have experience with the required tech stack (Java, Spring, Kafka)?', 'STOP'],
  ['Do you have experience with the specific language or tech stack listed?', 'STOP'],
  // test 3: "relatively" is not a relative; relocating at your own expense is the candidate's call
  ['Do you have any relatives working at Acme?', 'No'],
  ['Do you enjoy working in a relatively small team?', null],
  ['Are you willing to relocate at your own expense?', 'STOP'],
  // exact wordings the Tesla filler asks
  ['Will you require immigration sponsorship?', NEEDS_ANY],
  ['Contact me about future opportunities', 'Yes'],
  ['Have you previously worked for Tesla?', 'No'],
  ['Are you a former Tesla intern or contract worker?', 'No'],
  ['Receive text message notifications', 'Yes'],
  ['Have you previously worked for this company?', 'No'],
  // exact wordings the Walmart filler asks
  ['Are you a current employee of Walmart?', 'No'],
  ['Can you complete I-9 verification of identity?', 'Yes'],
  ['Is a relative employed here?', 'No'],
  ['Have you served in the military?', 'No'],
  // Apple, Amazon and OpenAI wordings
  ['Have you ever been employed by Apple?', 'No'],
  ['Have you worked here as a contract worker?', 'No'],
  ['Will you require sponsorship?', NEEDS_ANY],
  ['Are you authorized to work in the country where this job is located?', 'Yes'],
  ['Are you able to work from our US office three days a week (hybrid)?', 'Yes'],
  // not shared: filler handles
  ['Veteran Status', null],
  ['Gender', null],
];

let fail = 0,
  n = 0;
const check = (ok, line) => {
  n++;
  if (!ok) fail++;
  if (!ok || process.argv.includes('-v')) console.log((ok ? 'ok   ' : 'FAIL ') + line);
};
const OPTS = ['Yes', 'No', 'H-1B', 'F-1 STEM OPT'];
for (const [q, want] of cases) {
  for (const [who, P] of Object.entries(PROFILES)) {
    const exp = want !== null && typeof want === 'object' ? want[who] : want;
    const r = answerFor(q, P);
    const got = r === null ? null : r.stop ? 'STOP' : OPTS.find((o) => r.pick.test(o)) || String(r.pick);
    check(got === exp, `[${who}] ${JSON.stringify(q).slice(0, 80)} => ${got}${got === exp ? '' : ' (want ' + exp + ')'}`);
  }
}

// Older profiles with only needs_sponsorship are read as now AND future.
{
  const legacy = { ...base, work_auth: { authorized_us: true, needs_sponsorship: true, visa_type: 'H-1B' } };
  for (const [q, exp] of [
    ['Do you currently require sponsorship?', 'Yes'],
    ['Will you now or in the future require sponsorship?', 'Yes'],
    ['Are you legally authorized to work in the US without sponsorship?', 'No'],
  ]) {
    const r = answerFor(q, legacy);
    const got = r.stop ? 'STOP' : OPTS.find((o) => r.pick.test(o));
    check(got === exp, `[legacy needs_sponsorship] ${q} => ${got}`);
  }
}
// A missing profile answer must stop, never guess.
{
  const r = answerFor('Have you ever worked for Acme before?', { work_auth: PROFILES.h1b.work_auth, answers: {} });
  check(!!(r && r.stop), 'missing profile answer => STOP');
}

// test 2: Workday free-text rules are anchored and essay prompts stop.
{
  const P = {
    ...PROFILES.h1b,
    address: { city: 'Austin', state: 'Texas' },
    salary_text: '$120,000',
    notice_long: '2 weeks notice',
    location_preference: 'Austin',
    links: { linkedin: 'https://linkedin.example/x' },
    how_heard: 'Company careers site',
  };
  P.work_auth = { ...P.work_auth, sponsorship_details: 'details', visa_status_text: 'H-1B' };
  for (const [label, exp] of [
    ['City', 'Austin'],
    ['City*', 'Austin'],
    ['Capacity planning experience (years)', null],
    ['State', 'Texas'],
    ['Please read the statement below and confirm', null],
    ['What are your salary expectations?', '$120,000'],
    ['Salary', '$120,000'],
    ['Do you have experience with compensation systems?', null],
    ['Describe your availability for on-call rotations', null],
    ['When can you start?', '2 weeks notice'],
    ['Notice period', '2 weeks notice'],
    ['LinkedIn Profile', 'https://linkedin.example/x'],
    ['How did you hear about us?', 'Company careers site'],
    ['Please provide details on your required sponsorship', 'details'],
    [
      'Tell us about a time you disagreed with a teammate about a technical decision and how you resolved it, with the outcome.',
      'STOP',
    ],
  ]) {
    const r = textAnswerFor(label, P);
    const got = r === null ? null : r.stop ? 'STOP' : r.text;
    check(got === exp, `[text] ${JSON.stringify(label).slice(0, 70)} => ${got}${got === exp ? '' : ' (want ' + exp + ')'}`);
  }
}

// test 4: work history and degrees matched by employer/title/school, exact title when the employer repeats.
{
  const jobs = [
    { employer: 'Acme', title: 'Software Engineer', description: 'A' },
    { employer: 'Acme', title: 'Software Engineer II', description: 'B' },
    { employer: 'Beta Corp', title: 'Developer', description: 'C' },
  ];
  for (const [co, title, exp] of [
    ['Acme Inc', 'Software Engineer', 'A'],
    ['Acme', 'Software Engineer II', 'B'],
    ['Acme', 'Senior Engineer', null],
    ['Beta Corp', 'Dev Intern', 'C'],
    ['Gamma', 'Developer', null],
  ]) {
    const w = matchWorkHistory(jobs, co, title);
    const got = w ? w.description : null;
    check(got === exp, `[work history] ${co} / ${title} => ${got}`);
  }
  const edu = [
    { school: 'State University', degree: "Master's Degree" },
    { school: 'State University', degree: "Bachelor's Degree" },
    { school: 'City College', degree: "Associate's Degree" },
  ];
  for (const [school, exp] of [
    ['City College', "Associate's Degree"],
    ['State University', null],
    ['Unknown School', null],
  ]) {
    const e = matchEducation(edu, school);
    const got = e ? e.degree : null;
    check(got === exp, `[education] ${school} => ${got}`);
  }
}

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
