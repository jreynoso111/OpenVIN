/** FMCSA crash-file rows matched to a plate; these are reported events, not fault findings. */

import type { SectionResult } from '../lib/types';
import type { PlateCrashHistory } from '../lib/api/fmcsaCrashes';
import { el, formatDate, formatNumber } from './dom';
import { emptyNote } from './panel';
import { vinPivot } from './pivot';

export function renderPlateCrashes(
  result: SectionResult<PlateCrashHistory>,
  issuingState: string | null,
): HTMLElement {
  const history = result.data;
  if (!history || history.events.length === 0) {
    return emptyNote(
      result.status === 'unavailable'
        ? result.note ?? 'FMCSA crash records are temporarily unavailable.'
        : result.note ?? 'No reported matching crashes in the look-back period.',
    );
  }

  const list = el(
    'ol',
    { class: 'plate-crashes' },
    ...history.events.map((event) =>
      el(
        'li',
        { class: 'plate-crashes__event' },
        el(
          'div',
          { class: 'plate-crashes__heading' },
          el('strong', {}, event.date ? formatDate(event.date) : 'Date not reported'),
          event.reportState ? el('span', { class: 'muted' }, ' · Reported in ' + event.reportState) : null,
        ),
        el(
          'p',
          { class: 'plate-crashes__facts' },
          'Plate ' + event.plate + (event.plateState ? ' ' + event.plateState : '') +
            ' · VIN ' + (event.vin && /^[A-HJ-NPR-Z0-9]{17}$/.test(event.vin) ? '' : event.vin ?? 'not reported'),
          event.vin && /^[A-HJ-NPR-Z0-9]{17}$/.test(event.vin) ? vinPivot(event.vin) : null,
        ),
        el(
          'p',
          { class: 'plate-crashes__severity' },
          (event.fatalities === null ? 'Fatalities not reported' : formatNumber(event.fatalities) + ' fatalities') +
            ' · ' +
            (event.injuries === null ? 'Injuries not reported' : formatNumber(event.injuries) + ' injuries') +
            ' · ' +
            (event.towAway === null ? 'Tow-away status not reported' : event.towAway ? 'tow-away reported' : 'no tow-away reported'),
        ),
      ),
    ),
  );
  return el(
    'div',
    {},
    el('p', { class: 'note' }, 'Reported FMCSA crash records since ' + formatDate(history.since) + '. Plate/state and VIN are shown when reported.'),
    !issuingState ? el('p', { class: 'note' }, 'No issuing-state filter was used; plates may be reused across states. Check the reported plate state on each row.') : null,
    list,
    history.capped ? el('p', { class: 'warn' }, 'The source row limit was reached; additional records may exist.') : null,
    el('p', { class: 'note' }, 'A vehicle listed in a crash report is not a finding of fault or liability.'),
  );
}
