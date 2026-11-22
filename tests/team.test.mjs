import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availability, contractSummary, contractText, loansFromTransfers, mergeSquad, parseTransfermarktSquad, teamNews,
} from '../src/team.js';

const tm = `
| 15 | ![Image 23: Leny Yoro](x)[Leny Yoro](https://www.transfermarkt.co.uk/leny-yoro/profil/spieler/923831) Centre-Back | 13/11/2005 (21) | ![Image](x) | 6 ft 3 in | right | 18/07/2024 | [Lille](x) | 30/06/2029 | [€45.00M](x) |
| 20 | ![Image 54: Carlos Baleba](x)[Carlos Baleba](https://www.transfermarkt.co.uk/carlos-baleba/profil/spieler/973085) Defensive Midfield | 03/01/2004 (22) | ![Image](x) | 5 ft 10 in | left | 25/08/2026 | [Brighton](x) | 30/06/2031 | [€65.00M](x) |
| 17 | ![Image 59: Andrey Santos](x)[Andrey Santos](https://www.transfermarkt.co.uk/andrey-santos/profil/spieler/743600) Defensive Midfield | 03/05/2004 (22) | ![Image](x) | 5 ft 11 in | right | 13/07/2026 | [Chelsea](x) | 30/06/2031 | [€45.00M](x) |
| 12 | ![Image 7: Karl Darlow](x)[Karl Darlow](https://www.transfermarkt.co.uk/karl-darlow/profil/spieler/99397) Goalkeeper | 08/10/1990 (36) | ![Image](x) | 6 ft 3 in | right | 14/07/2026 | [Leeds](x) | 30/06/2028 | [€200.0K](x) |
| 19 | ![Image 97: Bryan Mbeumo](x)[Bryan Mbeumo](https://www.transfermarkt.co.uk/bryan-mbeumo/profil/spieler/413039) Right Winger | 07/08/1999 (27) | ![Image](x) | 5 ft 7 in | left | 21/07/2025 | [Brentford](x) | 30/06/2030 | [€75.00M](x) |
`;

const element = (first, second, web, type, extra = {}) => ({
  first_name: first, second_name: second, web_name: web, element_type: type,
  status: 'a', news: '', chance_of_playing_next_round: null,
  minutes: 0, goals_scored: 0, assists: 0, total_points: 0, ...extra,
});

test('the squad page gives position, age, contract and value', () => {
  const rows = parseTransfermarktSquad(tm);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[1], {
    name: 'Carlos Baleba', position: 'Defensive Midfield', age: 22,
    contract: '2031-06-30', value: '€65.00M',
  });
  assert.equal(rows[0].contract, '2029-06-30');
  assert.equal(rows[3].value, '€200.0K');
  assert.equal(rows[4].position, 'Right Winger');
});

test('FPL availability and form merge with the contract rows by name', () => {
  const players = mergeSquad([
    element('Carlos', 'Baleba', 'Baleba', 3, { code: 535301, status: 'i', news: 'Hamstring injury - Unknown return date', minutes: 232, total_points: 8 }),
    element('Andrey', 'Nascimento dos Santos', 'Andrey Santos', 3),
    element('Kobbie', 'Mainoo', 'Mainoo', 3),
    element('Senne', 'Lammens', 'Lammens', 1),
    element('Bryan', 'Mbeumo', 'Mbeumo', 3),
  ], parseTransfermarktSquad(tm));
  const baleba = players.find((player) => player.name === 'Baleba');
  assert.equal(baleba.group, 'MID');
  assert.equal(baleba.position, 'Defensive Midfield');
  assert.equal(baleba.age, 22);
  assert.equal(baleba.contract, '2031-06-30');
  assert.equal(baleba.minutes, 232);
  assert.ok(baleba.photo.endsWith('/p535301.png'));
  assert.equal(players[0].group, 'GK');
  const santos = players.find((player) => player.name === 'Andrey Santos');
  assert.equal(santos.contract, '2031-06-30');
  assert.equal(players.find((player) => player.name === 'Mainoo').contract, '');
  assert.equal(players.find((player) => player.name === 'Mbeumo').group, 'FWD');
});

test('availability labels cover fit, doubt, injury, suspension and loan', () => {
  assert.deepEqual(availability({ status: 'a' }), { label: 'Fit', tone: 'fit' });
  assert.deepEqual(availability({ status: 'd', chance: 75 }), { label: 'Doubt 75%', tone: 'warn' });
  assert.deepEqual(availability({ status: 'i' }), { label: 'Injured', tone: 'out' });
  assert.deepEqual(availability({ status: 's' }), { label: 'Suspended', tone: 'out' });
  assert.deepEqual(availability({ status: 'u', news: 'Has joined Celta Vigo on loan' }), { label: 'Loan', tone: 'muted' });
});

test('contracts group by year and team news puts injuries first', () => {
  const players = [
    { name: 'Bruno Fernandes', contract: '2027-06-30', status: 'a', news: '' },
    { name: 'Harry Maguire', contract: '2027-06-30', status: 'a', news: '' },
    { name: 'Leny Yoro', contract: '2029-06-30', status: 'i', news: 'Injured' },
    { name: 'Karl Darlow', contract: '2028-06-30', status: 'd', chance: 75, news: '' },
  ];
  assert.deepEqual(contractSummary(players), [
    { year: '2027', names: ['Bruno Fernandes', 'Harry Maguire'] },
    { year: '2028', names: ['Karl Darlow'] },
    { year: '2029', names: ['Leny Yoro'] },
  ]);
  assert.deepEqual(teamNews(players).map((player) => player.name), ['Leny Yoro', 'Karl Darlow']);
  assert.equal(contractText('2031-06-30'), 'Jun 2031');
});

test('loans come from the transfer desk and only include loans out', () => {
  assert.deepEqual(loansFromTransfers({ united: [
    { player: 'Dan Gore', direction: 'out', kind: 'Loan out', club: 'Luton', date: 3 },
    { player: 'Radek Vitek', direction: 'out', kind: 'Sold', club: 'Middlesbrough', date: 2 },
    { player: 'Carlos Baleba', direction: 'in', kind: 'Signed', club: 'Brighton', date: 1 },
  ] }), [{ player: 'Dan Gore', club: 'Luton', date: 3, link: undefined }]);
});
