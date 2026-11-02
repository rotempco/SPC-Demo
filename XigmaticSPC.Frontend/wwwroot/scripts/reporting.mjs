// Reports describe recorded evidence. They never recalculate a measurement using
// today's specification or change the quality workflow while exporting.
const copy = value => structuredClone(value);
const list = value => Array.isArray(value) ? value : [];
const orderOf = row => row?.orderId ?? row?.orderSnapshot?.id ?? row?.context?.orderId;
const byTime = field => (a,b) => (Date.parse(a[field]) || 0) - (Date.parse(b[field]) || 0) || String(a.id).localeCompare(String(b.id));

function timestamp(value, name) {
  if (value == null || value === '') return null;
  if (!(value instanceof Date) && (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value))) {
    throw new Error(`${name} must be an ISO timestamp with a timezone.`);
  }
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new Error(`${name} is invalid.`);
  return instant.toISOString();
}

function scopeFor(data, options = {}) {
  const orderId = options.orderId && options.orderId !== 'all' ? String(options.orderId) : null;
  if (orderId && ![...list(data.orders), ...list(data.measurements), ...list(data.sessions)].some(row => row.id === orderId || orderOf(row) === orderId)) {
    throw new Error('Unknown production order.');
  }
  const from = timestamp(options.from, 'From');
  const to = timestamp(options.to, 'To');
  if (from && to && Date.parse(from) >= Date.parse(to)) throw new Error('From must be earlier than To.');
  return {
    orderId, from, to,
    generatedAt: timestamp(options.generatedAt ?? new Date(), 'Generated at'),
    timeSemantics: 'From inclusive; To exclusive. Measurements use measuredAt. Related event histories are retained in full.'
  };
}

function within(at, scope) {
  if (!scope.from && !scope.to) return true;
  const instant = Date.parse(at);
  return Number.isFinite(instant) && (!scope.from || instant >= Date.parse(scope.from)) && (!scope.to || instant < Date.parse(scope.to));
}

function measurementModel(measurement, data) {
  const row = copy(measurement);
  const stream = list(data.streams).find(item => item.id === row.streamId);
  const snapshot = row.orderSnapshot ?? {};
  // Stream fallback is for display labels only. Revisions, specifications,
  // evaluation and baseline references always come from the recorded row.
  return {
    ...row,
    station: row.station ?? snapshot.station ?? stream?.station ?? '',
    characteristic: row.characteristic ?? row.definitionSnapshot?.name ?? stream?.name ?? row.streamId,
    unit: row.unit ?? row.definitionSnapshot?.unit ?? stream?.unit ?? '',
    product: row.product ?? snapshot.product ?? row.definitionSnapshot?.product ?? '',
    productCode: row.productCode ?? snapshot.productCode ?? '',
    orderId: orderOf(row) ?? null,
    orderNumber: row.orderNumber ?? snapshot.number ?? '',
    batch: row.batch ?? snapshot.batch ?? ''
  };
}

/**
 * Build an order report, or an all-orders report when orderId is omitted.
 * Dates select measurements in [from,to). Events are included when their
 * measurement, verification or recorded transition relates to this period.
 * Closed events remain visible. No date options means the entire order history.
 */
export function buildReport(data, options = {}) {
  const scope = scopeFor(data, options);
  const orderMatches = row => !scope.orderId || orderOf(row) === scope.orderId;
  const measurements = list(data.measurements).filter(row => !row.voided && orderMatches(row) && within(row.measuredAt, scope)).map(row => measurementModel(row, data)).sort(byTime('measuredAt'));
  const measurementIds = new Set(measurements.map(row => row.id));
  const allMeasurements = new Map(list(data.measurements).map(row => [row.id, row]));
  const events = list(data.events).filter(event => {
    const source = allMeasurements.get(event.measurementId);
    const eventOrder = orderOf(event) ?? orderOf(source);
    if (event.superseded || (scope.orderId && eventOrder !== scope.orderId)) return false;
    return measurementIds.has(event.measurementId) || measurementIds.has(event.verifiedMeasurementId) || within(event.at, scope) || list(event.transitions).some(item => within(item.at, scope));
  }).map(copy).sort(byTime('at'));
  const eventIds = new Set(events.map(row => row.id));
  const sessions = list(data.sessions).filter(row => orderMatches(row) && (within(row.startedAt, scope) || (row.completedAt && within(row.completedAt, scope)) || list(row.results).some(id => measurementIds.has(id)))).map(copy).sort(byTime('startedAt'));
  const sessionIds = new Set(sessions.map(row => row.id));
  const audit = list(data.audit).filter(row => {
    if (!within(row.at, scope)) return false;
    if (!scope.orderId) return true;
    const explicitOrder = orderOf(row);
    if (explicitOrder) return explicitOrder === scope.orderId;
    const context = row.context ?? {};
    return measurementIds.has(row.measurementId ?? context.measurementId) || eventIds.has(row.eventId ?? context.eventId) || sessionIds.has(row.sessionId ?? context.sessionId);
  }).map(copy).sort(byTime('at'));
  return {
    scope,
    workspace: copy(data.workspace ?? {name: 'Nordic Precision', synthetic: true}),
    order: copy(list(data.orders).find(row => row.id === scope.orderId) ?? null),
    measurements, events, sessions, audit,
    totals: {
      measurements: measurements.length,
      withinSpecification: measurements.filter(row => row.oos === false).length,
      signals: measurements.filter(row => row.ooc === true).length,
      open: events.filter(row => row.status === 'Open').length,
      acknowledged: events.filter(row => row.status === 'Acknowledged').length,
      closed: events.filter(row => row.status === 'Closed').length,
      unresolved: events.filter(row => row.status !== 'Closed').length,
      inProgress: sessions.filter(row => row.status === 'In progress').length,
      completed: sessions.filter(row => row.status === 'Completed').length
    }
  };
}

/** Quote every CSV field and neutralize formula/control prefixes in text. */
export function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (typeof value !== 'number' && (/^[\s\uFEFF]*[\t\r\n]/.test(text) || /^[\s\uFEFF]*[=+\-@]/.test(text))) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function measurementsCsv(report) {
  const utc = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : value;
  const columns = [
    ['measurement_id', row => row.id], ['order_id', row => row.orderId], ['production_order', row => row.orderNumber],
    ['product_code', row => row.productCode], ['product', row => row.product], ['workstation', row => row.station],
    ['characteristic', row => row.characteristic], ['stream_id', row => row.streamId],
    ['product_revision', row => row.productRev], ['characteristic_revision', row => row.charRev],
    ['value', row => row.value], ['unit', row => row.unit], ['measured_at_utc', row => utc(row.measuredAt)],
    ['recorded_at_utc', row => utc(row.recordedAt)], ['batch', row => row.batch], ['operator', row => row.operator],
    ['source', row => row.source], ['source_record_id', row => row.sourceRecordId],
    ['session_id', row => row.sessionId], ['plan_id', row => row.planId], ['plan_revision', row => row.planRevision],
    ['measurement_revision', row => row.revision], ['specification_revision', row => row.specRev],
    ['specification_lsl', row => row.specSnapshot?.lsl], ['specification_target', row => row.specSnapshot?.target],
    ['specification_usl', row => row.specSnapshot?.usl], ['baseline_id', row => row.baselineId],
    ['oos', row => row.oos], ['ooc', row => row.ooc == null ? 'Not evaluated' : row.ooc],
    ['rules', row => list(row.rules).join(' | ')], ['algorithm', row => row.algorithm]
  ];
  return '\uFEFF' + [columns.map(([label]) => label), ...report.measurements.map(row => columns.map(([, read]) => read(row)))].map(row => row.map(csvCell).join(';')).join('\r\n');
}

/** Build a portable evidence package without serializing unrelated workspace data. */
export function buildEvidence(data, options = {}) {
  const report = buildReport(data, options);
  const {scope} = report;
  const matchesOrder = row => !scope.orderId || orderOf(row) === scope.orderId;
  const selectedIds = new Set(report.measurements.map(row => row.id));
  const linkedIds = new Set(report.events.flatMap(row => [row.measurementId, row.verifiedMeasurementId]).filter(Boolean));
  for (const session of report.sessions) for (const id of list(session.results)) if (id) linkedIds.add(id);
  const missingReferences = [];
  const sourceMeasurements = new Map(list(data.measurements).map(row => [row.id,row]));
  const supportingMeasurements = [];
  for (const id of linkedIds) {
    if (selectedIds.has(id)) continue;
    const row = sourceMeasurements.get(id);
    if (!row || !matchesOrder(row)) {
      missingReferences.push({type: 'measurement', id, reason: row ? 'Outside the selected order scope.' : 'Not retained in this workspace.'});
    } else supportingMeasurements.push(measurementModel(row, data));
  }
  const voidedMeasurements = list(data.measurements).filter(row => row.voided && matchesOrder(row) && within(row.measuredAt,scope) && !linkedIds.has(row.id)).map(row => measurementModel(row,data)).sort(byTime('measuredAt'));
  const evidenceMeasurements = [...report.measurements, ...supportingMeasurements, ...voidedMeasurements];
  const evidenceIds = new Set(evidenceMeasurements.map(row => row.id));
  const supersededEvents = list(data.events).filter(row => row.superseded && evidenceIds.has(row.measurementId) && (!scope.orderId || (orderOf(row) ?? orderOf(sourceMeasurements.get(row.measurementId))) === scope.orderId)).map(copy).sort(byTime('at'));
  const baselines = [];
  const configurations = [];
  const knownBaselines = new Set(), knownDefinitions = new Set();
  for (const row of evidenceMeasurements) {
    const stream = list(data.streams).find(item => item.id === row.streamId);
    const baselineKey = JSON.stringify([row.streamId,row.baselineId]);
    if (row.baselineId && !knownBaselines.has(baselineKey)) {
      knownBaselines.add(baselineKey);
      const stored = row.baselineSnapshot?.id === row.baselineId ? row.baselineSnapshot : [stream?.limits,...list(stream?.baselineHistory)].find(item => item?.id === row.baselineId);
      if (stored) {
        baselines.push({streamId: row.streamId, ...copy(stored)});
        for (const member of list(stored.members)) {
          const id = typeof member === 'string' ? member : member.id;
          const observation = sourceMeasurements.get(id);
          const memberOrder = orderOf(observation);
          const reason = !observation ? 'Not retained in this workspace.'
            : scope.orderId && memberOrder && memberOrder !== scope.orderId ? 'Outside the selected order scope.'
            : observation.streamId !== row.streamId ? 'The observation belongs to another process stream.'
            : null;
          if (reason) {
            missingReferences.push({type:'baseline-member',id,baselineId:stored.id,streamId:row.streamId,reason});
            continue;
          }
          // Unassigned reference runs are shared calculation evidence. Include
          // only explicitly referenced rows, never other orders or prior runs.
          if (!evidenceIds.has(id)) {
            const model = measurementModel(observation,data);
            supportingMeasurements.push(model);
            evidenceMeasurements.push(model);
            evidenceIds.add(id);
          }
          const revision = typeof member === 'object' ? member.revision : undefined;
          if (revision != null && observation.revision !== revision && !list(observation.revisions).some(item => item.revision === revision)) {
            missingReferences.push({type:'baseline-member-revision',id,revision,baselineId:stored.id,streamId:row.streamId,reason:'The baseline member revision is not retained in this workspace.'});
          }
        }
      } else missingReferences.push({type:'baseline',id:row.baselineId,streamId:row.streamId,reason:'The recorded baseline is not retained in this workspace.'});
    }
    const definition = {streamId: row.streamId, productRev: row.productRev, charRev: row.charRev, specRev: row.specRev, specification: copy(row.specSnapshot ?? null)};
    const definitionKey = JSON.stringify(definition);
    if (!knownDefinitions.has(definitionKey)) { knownDefinitions.add(definitionKey); configurations.push(definition); }
  }
  const plans = report.sessions.map(session => ({sessionId:session.id,planId:session.planId,revision:session.planRevision,name:session.planName,steps:copy(session.steps),definitions:copy(session.definitions ?? {})}));
  return {
    format:'xigmatic-spc-evidence/1.0',
    provenance:{synthetic:true,environment:'Browser-local prototype',productionValidated:false,description:'Synthetic demonstration data. This export records prototype behavior and is not a production validation or certification.'},
    ...report,
    supportingMeasurements:supportingMeasurements.sort(byTime('measuredAt')),
    voidedMeasurements,
    supersededEvents,
    references:{baselines,configurations,plans,missing:missingReferences},
    exportNotes:[
      'Measurements are selected by measuredAt in [from,to); without dates, the entire selected order is included.',
      'Related events retain their full response histories, including closure. Referenced session and verification measurements outside the time window are separated as supporting evidence.',
      'Stored specification snapshots and original evaluation results are exported without recalculation. Current stream metadata is used only for missing display labels.',
      'Referenced baseline observations are included as supporting measurements when unassigned or from the selected order, regardless of date window. Their stored revisions are retained; unavailable members or revisions are listed under references.missing. Other production-order observations and unreferenced prior runs are excluded.'
    ]
  };
}

export function evidenceJson(data, options = {}) {
  return JSON.stringify(buildEvidence(data, options), null, 2);
}
