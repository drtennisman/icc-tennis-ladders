/**
 * ICC Tennis Ladders — Google Apps Script
 *
 * ONE sheet, MANY ladders. Configure ladders in the "Ladders" tab.
 *
 * ── Setup ──────────────────────────────────────────────────
 *   1. Create a new Google Sheet named "Ladders Worksheet".
 *   2. Open Extensions > Apps Script, delete any existing code,
 *      and paste this whole file in. Save.
 *   3. Run the `setupLaddersTab` function once from the editor
 *      (click Run). Approve permissions when prompted.
 *      This creates the "Ladders" config tab with headers + an
 *      example row.
 *   4. Deploy > New deployment > Web app
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   5. Copy the Web App URL into index.html (APPS_SCRIPT_URL).
 *
 * ── Adding a new ladder ────────────────────────────────────
 *   Add a row to the "Ladders" tab:
 *     Ladder Name | Active | Rounds | Format | Players
 *     2026 Men's  | TRUE   | 12     | pro-set| Jack, Lynn, ...
 *
 *   Format:
 *     "pro-set"    → single 8-game pro set (first to 8)
 *     "best-of-3"  → best of 3 traditional sets
 *
 *   Players = comma-separated list.
 *   Active  = TRUE to show in the app, FALSE to hide.
 *
 *   No code changes required.
 *
 * ── Match tab schema (auto-created) ────────────────────────
 *   "<Ladder Name> - Matches" columns:
 *     Date | Round | Winner | Learner |
 *     Winner Sets | Learner Sets | Winner Games | Learner Games |
 *     Score | Format | Submitted At
 */

// ═══════════════════════════════════════════════════════════
//  SETUP — run this once from the Apps Script editor
// ═══════════════════════════════════════════════════════════
function setupLaddersTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Ladders');

  if (!sheet) {
    sheet = ss.insertSheet('Ladders');
  }

  // Header row (5 columns now)
  sheet.getRange(1, 1, 1, 5)
    .setValues([['Ladder Name', 'Active', 'Rounds', 'Format', 'Players']])
    .setFontWeight('bold')
    .setBackground('#052d54')
    .setFontColor('#ffffff');

  // Example row if the sheet is empty
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, 1, 5).setValues([[
      '2026 Men\'s Singles',
      true,
      12,
      'pro-set',
      'Player One, Player Two, Player Three'
    ]]);
  }

  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 80);
  sheet.setColumnWidth(3, 80);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 500);
  sheet.setFrozenRows(1);

  SpreadsheetApp.getUi().alert(
    'Ladders tab ready!\n\n' +
    'Edit row 2 with your real ladder name, players, rounds, and format ' +
    '("pro-set" or "best-of-3"). Add more rows for more ladders.'
  );
}

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
function getLaddersConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Ladders');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var lastCol = Math.max(5, sheet.getLastColumn());
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
  var ladders = [];

  for (var i = 0; i < rows.length; i++) {
    var name    = String(rows[i][0] || '').trim();
    var active  = rows[i][1] === true || String(rows[i][1]).toUpperCase() === 'TRUE';
    var rounds  = Number(rows[i][2]) || 12;
    var format  = String(rows[i][3] || 'pro-set').trim().toLowerCase();
    var playersRaw = String(rows[i][4] || '').trim();

    if (!name) continue;
    if (format !== 'pro-set' && format !== 'best-of-3') format = 'pro-set';

    var players = playersRaw
      .split(',')
      .map(function(p) { return p.trim(); })
      .filter(function(p) { return p.length > 0; });

    ladders.push({
      name: name,
      active: active,
      rounds: rounds,
      format: format,
      players: players
    });
  }

  return ladders;
}

function getLadderByName(name) {
  var ladders = getLaddersConfig();
  for (var i = 0; i < ladders.length; i++) {
    if (ladders[i].name === name) return ladders[i];
  }
  return null;
}

function getMatchesSheet(ladderName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabName = ladderName + ' - Matches';
  var sheet = ss.getSheetByName(tabName);

  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.getRange(1, 1, 1, 11)
      .setValues([[
        'Date', 'Round', 'Winner', 'Learner',
        'Winner Sets', 'Learner Sets',
        'Winner Games', 'Learner Games',
        'Score', 'Format', 'Submitted At'
      ]])
      .setFontWeight('bold')
      .setBackground('#052d54')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 60);
    sheet.setColumnWidth(3, 150);
    sheet.setColumnWidth(4, 150);
    sheet.setColumnWidth(5, 80);
    sheet.setColumnWidth(6, 80);
    sheet.setColumnWidth(7, 90);
    sheet.setColumnWidth(8, 90);
    sheet.setColumnWidth(9, 140);
    sheet.setColumnWidth(10, 90);
    sheet.setColumnWidth(11, 180);
  }

  return sheet;
}

// ═══════════════════════════════════════════════════════════
//  POST — log a match result
// ═══════════════════════════════════════════════════════════
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (!data.ladder)  throw new Error('Missing ladder name.');
    if (!data.winner)  throw new Error('Missing winner.');
    if (!data.learner) throw new Error('Missing learner.');

    var ladder = getLadderByName(data.ladder);
    if (!ladder) throw new Error('Ladder not found: ' + data.ladder);
    var format = ladder.format;

    var winnerSets = 0, learnerSets = 0;
    var winnerGames = 0, learnerGames = 0;
    var scoreStr = '';

    if (format === 'pro-set') {
      var wg = Number(data.winnerGames || 8);
      var lg = Number(data.learnerGames || 0);
      winnerSets = 1;
      learnerSets = 0;
      winnerGames = wg;
      learnerGames = lg;
      scoreStr = wg + '-' + lg;
    } else {
      // best-of-3
      var sets = Array.isArray(data.sets) ? data.sets : [];
      var parts = [];
      for (var s = 0; s < sets.length; s++) {
        var ws = Number(sets[s].winner);
        var ls = Number(sets[s].learner);
        if (isNaN(ws) || isNaN(ls)) continue;
        if (ws === 0 && ls === 0) continue;
        winnerGames += ws;
        learnerGames += ls;
        if (ws > ls) winnerSets += 1;
        else if (ls > ws) learnerSets += 1;
        parts.push(ws + '-' + ls);
      }
      scoreStr = parts.join(', ');
    }

    var sheet = getMatchesSheet(data.ladder);
    sheet.appendRow([
      data.date || '',
      data.round || '',
      data.winner,
      data.learner,
      winnerSets,
      learnerSets,
      winnerGames,
      learnerGames,
      scoreStr,
      format,
      new Date().toISOString()
    ]);

    return jsonOut({ status: 'ok' });

  } catch (err) {
    return jsonOut({ status: 'error', message: err.toString() });
  }
}

// ═══════════════════════════════════════════════════════════
//  GET — list ladders OR return standings for a ladder
// ═══════════════════════════════════════════════════════════
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'ladders';

    if (action === 'ladders') {
      var all = getLaddersConfig();
      var active = all.filter(function(l) { return l.active; });
      return jsonOut({ status: 'ok', ladders: active });
    }

    if (action === 'standings') {
      var ladderName = e.parameter.ladder;
      if (!ladderName) throw new Error('Missing ladder parameter.');
      var result = calculateStandings(ladderName);
      return jsonOut(result);
    }

    throw new Error('Unknown action: ' + action);

  } catch (err) {
    return jsonOut({ status: 'error', message: err.toString() });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════
//  STANDINGS CALCULATION
// ═══════════════════════════════════════════════════════════
function calculateStandings(ladderName) {
  var ladder = getLadderByName(ladderName);
  if (!ladder) throw new Error('Ladder not found: ' + ladderName);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ladderName + ' - Matches');

  // Initialize stats for every player in the ladder
  var stats = {};
  for (var i = 0; i < ladder.players.length; i++) {
    stats[ladder.players[i]] = {
      name: ladder.players[i],
      matches: 0,
      matchesWon: 0,
      matchesLost: 0,
      setsWon: 0,
      setsLost: 0,
      gamesWon: 0,
      gamesLost: 0
    };
  }

  var recent = [];

  if (sheet && sheet.getLastRow() > 1) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();

    for (var r = 0; r < rows.length; r++) {
      var date    = rows[r][0];
      var round   = rows[r][1];
      var winner  = rows[r][2];
      var learner = rows[r][3];
      var wSets   = Number(rows[r][4]) || 0;
      var lSets   = Number(rows[r][5]) || 0;
      var wGames  = Number(rows[r][6]) || 0;
      var lGames  = Number(rows[r][7]) || 0;
      var scoreStr= rows[r][8];
      var fmt     = rows[r][9];

      if (stats[winner]) {
        stats[winner].matches     += 1;
        stats[winner].matchesWon  += 1;
        stats[winner].setsWon     += wSets;
        stats[winner].setsLost    += lSets;
        stats[winner].gamesWon    += wGames;
        stats[winner].gamesLost   += lGames;
      }
      if (stats[learner]) {
        stats[learner].matches     += 1;
        stats[learner].matchesLost += 1;
        stats[learner].setsWon     += lSets;
        stats[learner].setsLost    += wSets;
        stats[learner].gamesWon    += lGames;
        stats[learner].gamesLost   += wGames;
      }

      recent.push({
        date:    date instanceof Date ? Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(date),
        round:   round,
        winner:  winner,
        learner: learner,
        score:   scoreStr,
        format:  fmt
      });
    }
  }

  // Compute percentages
  var standings = Object.keys(stats).map(function(k) {
    var p = stats[k];
    var totalMatches = p.matches;
    var totalSets    = p.setsWon + p.setsLost;
    var totalGames   = p.gamesWon + p.gamesLost;
    p.matchesPct = totalMatches > 0 ? p.matchesWon / totalMatches : 0;
    p.setsPct    = totalSets    > 0 ? p.setsWon    / totalSets    : 0;
    p.gamesPct   = totalGames   > 0 ? p.gamesWon   / totalGames   : 0;
    p.netGames   = p.gamesWon - p.gamesLost;
    return p;
  });

  // Sort differently by format:
  //   pro-set   → games win % > fewest games lost > most games won
  //   best-of-3 → sets %      > games %           > net games
  if (ladder.format === 'best-of-3') {
    standings.sort(function(a, b) {
      if (b.setsPct  !== a.setsPct)  return b.setsPct  - a.setsPct;
      if (b.gamesPct !== a.gamesPct) return b.gamesPct - a.gamesPct;
      if (b.netGames !== a.netGames) return b.netGames - a.netGames;
      return a.name.localeCompare(b.name);
    });
  } else {
    standings.sort(function(a, b) {
      if (b.gamesPct  !== a.gamesPct)  return b.gamesPct  - a.gamesPct;
      if (a.gamesLost !== b.gamesLost) return a.gamesLost - b.gamesLost; // fewer is better
      return a.name.localeCompare(b.name);
    });
  }

  // Matchups: #1 vs #2, #3 vs #4, ...
  var matchups = [];
  for (var m = 0; m < standings.length - 1; m += 2) {
    matchups.push({
      rank1: m + 1,
      rank2: m + 2,
      player1: standings[m].name,
      player2: standings[m + 1].name
    });
  }

  // Most recent 15 matches (reverse chronological by row order)
  recent.reverse();
  var recentMatches = recent.slice(0, 15);

  return {
    status: 'ok',
    ladder: ladderName,
    format: ladder.format,
    rounds: ladder.rounds,
    standings: standings,
    matchups: matchups,
    recent: recentMatches
  };
}
