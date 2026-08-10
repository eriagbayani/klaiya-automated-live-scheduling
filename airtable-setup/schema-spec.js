/* Single source of truth for the Airtable base schema.
   Used by create-base.js, verify-schema.js and seed-data.js. */

const sel = (...names) => ({ choices: names.map(name => ({ name })) });
const check = { icon: 'check', color: 'greenBright' };
const isoDate = { dateFormat: { name: 'iso' } };

module.exports = {
  // Tables are created in this order - link fields can only point at tables
  // that already exist.
  tables: [
    {
      name: 'Clients',
      primary: { name: 'Client Name', type: 'singleLineText' },
      fields: [
        { name: 'Brand Tier', type: 'singleSelect', options: sel('A', 'B', 'C') },
        { name: 'Platform', type: 'singleSelect', options: sel('TikTok Shop', 'Shopee', 'Lazada', 'Multi') },
        { name: 'Requires Certification', type: 'checkbox', options: check },
        { name: 'Active', type: 'checkbox', options: check },
      ],
      links: [],
      derived: [],
    },

    {
      name: 'Staff',
      primary: { name: 'Name', type: 'singleLineText' },
      fields: [
        { name: 'Role', type: 'singleSelect', options: sel('Live Host', 'Live Admin', 'Both') },
        { name: 'Active', type: 'checkbox', options: check },
        { name: 'Max Sessions Per Week', type: 'number', options: { precision: 0 } },
        { name: 'Notify Channel', type: 'singleSelect', options: sel('Telegram', 'Slack', 'Email') },
        { name: 'Telegram Chat ID', type: 'singleLineText' },
        { name: 'Slack Member ID', type: 'singleLineText' },
        { name: 'Email', type: 'email' },
        { name: 'Skill Tier', type: 'singleSelect', options: sel('Senior', 'Mid', 'Junior') },
        { name: 'Date Joined', type: 'date', options: isoDate },
      ],
      links: [
        { name: 'Certified Clients', to: 'Clients', single: false },
      ],
      derived: [],
    },

    {
      name: 'Sessions',
      // Primary is plain text rather than a formula: formula fields cannot be
      // created through the API, and the primary field cannot be changed later.
      primary: { name: 'Session Name', type: 'singleLineText' },
      fields: [
        { name: 'Date', type: 'date', options: isoDate },
        { name: 'Start Time', type: 'singleLineText' },
        { name: 'End Time', type: 'singleLineText' },
        { name: 'Hosts Required', type: 'number', options: { precision: 0 } },
        { name: 'Admins Required', type: 'number', options: { precision: 0 } },
        { name: 'Status', type: 'singleSelect', options: sel('Draft', 'Published', 'Cancelled') },
        { name: 'Notes', type: 'multilineText' },
      ],
      links: [
        { name: 'Client', to: 'Clients', single: true },
      ],
      derived: [
        { name: 'Client Name', kind: 'lookup', via: 'Client', field: 'Client Name' },
        { name: 'Brand Tier', kind: 'lookup', via: 'Client', field: 'Brand Tier' },
        { name: 'Requires Certification', kind: 'lookup', via: 'Client', field: 'Requires Certification' },
      ],
    },

    {
      name: 'Availability',
      primary: { name: 'Availability ID', type: 'singleLineText' },
      fields: [
        { name: 'Date', type: 'date', options: isoDate },
        { name: 'Available From', type: 'singleLineText' },
        { name: 'Available To', type: 'singleLineText' },
        { name: 'Source', type: 'singleSelect', options: sel('Form', 'Parsed', 'Manual') },
        { name: 'Raw Text', type: 'multilineText' },
        { name: 'Needs Review', type: 'checkbox', options: check },
      ],
      links: [
        { name: 'Staff', to: 'Staff', single: true },
      ],
      derived: [
        { name: 'Staff Name', kind: 'lookup', via: 'Staff', field: 'Name' },
      ],
    },

    {
      name: 'Absences',
      primary: { name: 'Absence ID', type: 'singleLineText' },
      fields: [
        { name: 'Date', type: 'date', options: isoDate },
        { name: 'Start Time', type: 'singleLineText' },
        { name: 'End Time', type: 'singleLineText' },
        { name: 'Reason', type: 'singleLineText' },
        { name: 'Status', type: 'singleSelect', options: sel('Open', 'Replacement Found', 'Escalated', 'Resolved Manually') },
        { name: 'Raw Message', type: 'multilineText' },
        { name: 'Parse Confidence', type: 'number', options: { precision: 2 } },
      ],
      links: [
        { name: 'Staff', to: 'Staff', single: true },
      ],
      derived: [],
    },

    {
      name: 'Assignments',
      primary: { name: 'Assignment ID', type: 'singleLineText' },
      fields: [
        { name: 'Role', type: 'singleSelect', options: sel('Live Host', 'Live Admin') },
        { name: 'Status', type: 'singleSelect', options: sel('Draft', 'Published', 'Cancelled', 'Replaced') },
        { name: 'Assigned By', type: 'singleSelect', options: sel('Auto', 'Manual', 'Replacement') },
        { name: 'Approved', type: 'checkbox', options: check },
        { name: 'Notified', type: 'checkbox', options: check },
        { name: 'Weight', type: 'number', options: { precision: 2 } },
        { name: 'Fairness Score At Assignment', type: 'number', options: { precision: 3 } },
        { name: 'Change Reason', type: 'singleLineText' },
        // Per-record audit baseline. Workflow E diffs the live row against this to
        // detect manual edits. Stored in Airtable rather than n8n static data,
        // which only persists for production runs of an ACTIVE workflow and is
        // lost on container restart.
        { name: 'Logged State', type: 'multilineText' },
        { name: 'Last Modified', type: 'lastModifiedTime', manualOnly: true, ui: 'Last modified time (all editable fields)' },
        { name: 'Last Modified By', type: 'lastModifiedBy', manualOnly: true, ui: 'Last modified by' },
      ],
      links: [
        { name: 'Session', to: 'Sessions', single: true },
        { name: 'Staff', to: 'Staff', single: true },
      ],
      derived: [
        { name: 'Session Date',   kind: 'lookup', via: 'Session', field: 'Date' },
        { name: 'Session Start',  kind: 'lookup', via: 'Session', field: 'Start Time' },
        { name: 'Session End',    kind: 'lookup', via: 'Session', field: 'End Time' },
        { name: 'Session Client', kind: 'lookup', via: 'Session', field: 'Client Name' },
        { name: 'Staff Name',            kind: 'lookup', via: 'Staff', field: 'Name' },
        { name: 'Staff Notify Channel',  kind: 'lookup', via: 'Staff', field: 'Notify Channel' },
        { name: 'Staff Telegram Chat ID',kind: 'lookup', via: 'Staff', field: 'Telegram Chat ID' },
        { name: 'Staff Slack Member ID', kind: 'lookup', via: 'Staff', field: 'Slack Member ID' },
        { name: 'Staff Email',           kind: 'lookup', via: 'Staff', field: 'Email' },
        { name: 'Session Date Flat', kind: 'formula', formula: "DATETIME_FORMAT({Session Date}, 'YYYY-MM-DD')" },
        { name: 'Staff Name Flat',   kind: 'formula', formula: 'ARRAYJOIN({Staff Name})' },
      ],
    },

    {
      name: 'Audit Log',
      primary: { name: 'Log ID', type: 'singleLineText' },
      fields: [
        { name: 'Action', type: 'singleSelect', options: sel(
          'DRAFT_GENERATED', 'ASSIGNMENT_CREATED', 'ASSIGNMENT_CHANGED', 'MANUAL_OVERRIDE',
          'PUBLISHED', 'ABSENCE_REPORTED', 'ABSENCE_REPLACED', 'ABSENCE_ESCALATED',
          'NOTIFICATION_SENT', 'AVAILABILITY_SUBMITTED') },
        { name: 'Actor', type: 'singleLineText' },
        { name: 'Before Value', type: 'multilineText' },
        { name: 'After Value', type: 'multilineText' },
        { name: 'Reason', type: 'multilineText' },
        { name: 'Source', type: 'singleSelect', options: sel('Automated', 'Manual') },
        { name: 'Timestamp', type: 'createdTime', manualOnly: true, ui: 'Created time' },
      ],
      links: [
        { name: 'Assignment', to: 'Assignments', single: true },
        { name: 'Staff Affected', to: 'Staff', single: true },
        { name: 'Session Affected', to: 'Sessions', single: true },
      ],
      derived: [],
    },
  ],

  // Added to Absences once Assignments exists.
  lateLinks: [
    { table: 'Absences', name: 'Affected Assignment', to: 'Assignments', single: true },
  ],
};
