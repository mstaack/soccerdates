import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, normalizeChannels } from '../scripts/channels.mjs';

const e = (name, ...icons) => ({ name, icons });

test('variants merge into one brand', () => {
  assert.equal(classify(e('Sky Sport Bundesliga 3 HD', 'hdtv')), 'Sky Sport Bundesliga');
  assert.equal(classify(e('Sky Sport Bundesliga UHD', 'hdtv')), 'Sky Sport Bundesliga');
  assert.equal(classify(e('DAZN (App)', 'mobile')), 'DAZN');
  assert.equal(classify(e('DAZN (Apple TV)', 'settop')), 'DAZN');
  assert.equal(classify(e('DAZN 2 HD', 'hdtv')), 'DAZN');
  assert.equal(classify(e('RTL+', 'internet')), 'RTL');
  assert.equal(classify(e('Das Erste HD', 'free', 'hdtv')), 'ARD');
  assert.equal(classify(e('DAZN (Austria)', 'internet')), 'DAZN');
});

test('Austrian channels are kept and merged', () => {
  assert.equal(classify(e('Sky Sport Austria 1', 'conference', 'tv')), 'Sky Sport Austria');
  assert.equal(classify(e('Sky Sport Austria 3 HD', 'hdtv')), 'Sky Sport Austria');
  assert.equal(classify(e('Sky X (Austria)', 'internet')), 'Sky X');
  assert.equal(classify(e('ORF 1', 'free', 'tv')), 'ORF');
  assert.equal(classify(e('ORF 1 HD', 'free', 'hdtv')), 'ORF');
  assert.equal(classify(e('ORF ON', 'free', 'internet')), 'ORF');
});

test('DAZN and Prime Video are always kept', () => {
  assert.equal(classify(e('DAZN', 'internet')), 'DAZN');
  assert.equal(classify(e('Amazon Prime Video', 'internet')), 'Prime Video');
  assert.equal(classify(e('Amazon Prime Video (App)', 'mobile')), 'Prime Video');
});

test('channels outside Germany/Austria and radio are dropped', () => {
  for (const n of ['blue Sport', 'blue Sport HD', 'blue Sport (Livestream)', 'RSI LA 2', 'SRF zwei', 'RTS 2',
    'TF1', 'Rai 1', 'CANAL+', "L'Équipe Live Football", 'DAZN (Schweiz)', 'Sky (Schweiz)',
    'Swisscom blue TV App', 'Sky Go', 'Sky Showcase HD']) {
    assert.equal(classify(e(n, 'tv')), null, n);
  }
  assert.equal(classify(e('ARD Audiothek', 'free', 'radio')), null);
  assert.equal(classify(e('FC Bayern Webradio', 'free', 'radio')), null);
});

test('conference feeds on Sky become Sky Konferenz', () => {
  assert.equal(classify(e('Sky Sport Bundesliga 2', 'conference', 'tv')), 'Sky Konferenz');
  assert.equal(classify(e('Sky Sport Top Event', 'conference', 'tv')), 'Sky Konferenz');
  assert.equal(classify(e('Sky Sport Bundesliga 4', 'tv')), 'Sky Sport Bundesliga');
});

test('normalizeChannels: unique, ordered free-TV, Sky, DAZN, Prime', () => {
  const out = normalizeChannels([
    e('DAZN', 'internet'), e('DAZN (App)', 'mobile'),
    e('Sky Sport Bundesliga 4', 'tv'), e('Sky Sport Bundesliga 4 HD', 'hdtv'),
    e('Amazon Prime Video', 'internet'), e('NITRO', 'free', 'tv'), e('Sky Sport Austria 1', 'tv'),
    e('ORF 1', 'free', 'tv'), e('blue Sport', 'tv'),
  ]);
  assert.deepEqual(out, ['ORF', 'NITRO', 'Sky Sport Bundesliga', 'Sky Sport Austria', 'DAZN', 'Prime Video']);
});

test('no channels (or only dropped ones) gives an empty list', () => {
  assert.deepEqual(normalizeChannels([]), []);
  assert.deepEqual(normalizeChannels([e('blue Sport', 'tv'), e('ARD Audiothek', 'radio')]), []);
});
