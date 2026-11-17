// Run: node tests/answers.test.js
// Real screening-question wordings seen on Greenhouse, Workday, Ashby, Eightfold and Oracle forms,
// with the answer each must get for a candidate on an H-1B who needs sponsorship.
const fs = require('fs'),
  path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'automation', 'lib', 'answers.js'), 'utf8');
const answerFor = new Function(src + '\nreturn answerFor;')();

const P = {
  work_auth: { authorized_us: true, needs_sponsorship: true, visa_type: 'H-1B' },
  open_to_relocate: true,
  open_to_onsite: true,
  consents: { arbitration: false },
  answers: {
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
  },
};
const cases = [
  // work authorization
  ['Are you legally authorized to work in the United States?', 'Yes'],
  ['Are you legally authorized to work in the US without sponsorship?', 'No'],
  ['Are you able to work in the United States without employer sponsorship now or in the future?', 'No'],
  ['Are you eligible to work in the U.S. without requiring visa sponsorship?', 'No'],
  ['Will you now or in the future require sponsorship for employment visa status (e.g. H-1B)?', 'Yes'],
  [
    "In order to obtain or maintain employment eligibility, will you now or in the future require the company's sponsorship?",
    'Yes',
  ],
  ['Do you require immigration support to work in the US?', 'Yes'],
  ['Do you have unrestricted authorization to work in the United States?', 'No'],
  ['Are you authorized to work in the US with or without sponsorship?', 'STOP'],
  ['Can you start work without a visa transfer?', 'STOP'],
  ['What type of visa sponsorship will you require?', 'H-1B'],
  // certifications and legal agreements
  ['I certify that I did not use AI tools to write any part of this application.', 'STOP'],
  ['I agree to the mutual arbitration agreement.', 'STOP'],
  ['I acknowledge that the information provided in this application is true and complete.', 'Yes'],
  ['I acknowledge and agree to the Terms and Conditions.', 'STOP'],
  ['I consent to the use of automated tools such as AI to support review of my application.', 'Yes'],
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
  // exact wordings the Tesla filler asks
  ['Will you require immigration sponsorship?', 'Yes'],
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
  // Apple wordings
  ['Are you at least 18 years of age?', 'Yes'],
  ['Have you ever been employed by Apple?', 'No'],
  ['Have you worked here as a contract worker?', 'No'],
  // not shared: filler handles
  ['Veteran Status', null],
  ['Gender', null],
];
let fail = 0;
for (const [q, want] of cases) {
  const r = answerFor(q, P);
  const got = r === null ? null : r.stop ? 'STOP' : ['Yes', 'No', 'H-1B'].find((o) => r.pick.test(o)) || String(r.pick);
  const ok = got === want;
  if (!ok) fail++;
  console.log(
    (ok ? 'ok   ' : 'FAIL ') +
      JSON.stringify(q).slice(0, 90) +
      ' => ' +
      got +
      (ok ? '' : ' (want ' + want + ')') +
      (r && r.stop ? '  [' + r.stop + ']' : ''),
  );
}
// a missing profile answer must stop, never guess
const r = answerFor('Have you ever worked for Acme before?', { work_auth: P.work_auth, answers: {} });
if (!r || !r.stop) {
  fail++;
  console.log('FAIL missing answer did not stop');
} else console.log('ok   missing profile answer => STOP');
console.log(fail ? `\n${fail} FAILED` : `\nall ${cases.length + 1} passed`);
process.exit(fail ? 1 : 0);
