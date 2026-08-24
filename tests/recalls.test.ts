import { describe, expect, test } from 'vitest';
import { mapRecallRecord, parseRecallsResponse } from '../src/lib/api/recalls';

// Trimmed from a real recallsByVehicle response (2003 Honda Accord).
const RECALL_RECORD = {
  NHTSACampaignNumber: '19V182000',
  parkIt: false,
  parkOutSide: false,
  overTheAirUpdate: false,
  ReportReceivedDate: '06/03/2019',
  Component: 'AIR BAGS:FRONTAL:DRIVER SIDE:INFLATOR MODULE',
  Summary: 'Honda is recalling certain vehicles that received a replacement driver air bag inflator.',
  Consequence: 'An inflator explosion may result in sharp metal fragments striking occupants.',
  Remedy: 'Dealers will replace the driver air bag inflator, free of charge.',
  ModelYear: '2003',
  Make: 'HONDA',
  Model: 'ACCORD',
};

describe('mapRecallRecord', () => {
  test('maps fields and converts the date to ISO', () => {
    const campaign = mapRecallRecord(RECALL_RECORD);
    expect(campaign.campaignNumber).toBe('19V182000');
    expect(campaign.reportReceivedDate).toBe('2019-06-03');
    expect(campaign.component).toBe('AIR BAGS:FRONTAL:DRIVER SIDE:INFLATOR MODULE');
    expect(campaign.summary).toMatch(/inflator/);
    expect(campaign.parkIt).toBe(false);
    expect(campaign.parkOutSide).toBe(false);
    expect(campaign.overTheAirUpdate).toBe(false);
  });

  test('boolean flags only true on literal true', () => {
    const campaign = mapRecallRecord({ ...RECALL_RECORD, parkIt: true, parkOutSide: 'yes' });
    expect(campaign.parkIt).toBe(true);
    expect(campaign.parkOutSide).toBe(false);
  });
});

describe('parseRecallsResponse', () => {
  test('parses and sorts newest first', () => {
    const body = {
      Count: 2,
      Message: 'Results returned successfully',
      results: [
        { ...RECALL_RECORD, NHTSACampaignNumber: 'OLD', ReportReceivedDate: '01/15/2004' },
        { ...RECALL_RECORD, NHTSACampaignNumber: 'NEW', ReportReceivedDate: '06/03/2019' },
      ],
    };
    const campaigns = parseRecallsResponse(body);
    expect(campaigns?.map((c) => c.campaignNumber)).toEqual(['NEW', 'OLD']);
  });

  test('empty results parse to an empty array', () => {
    expect(parseRecallsResponse({ Count: 0, results: [] })).toEqual([]);
  });

  test.each([null, 42, { nope: true }, { results: 'x' }])('bad shape %j yields null', (body) => {
    expect(parseRecallsResponse(body)).toBeNull();
  });
});
