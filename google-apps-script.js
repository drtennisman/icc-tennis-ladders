/**
 * ICC Tennis Ladders - Google Apps Script
 *
 * ONE sheet, MANY ladders. Configure ladders in the "Ladders" tab.
 *
 * -- Setup --------------------------------------------------
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
 * -- Adding a new ladder ------------------------------------
 *   Add a row to the "Ladders" tab:
 *     Ladder Name | Active | Rounds | Format | Players
 *     2026 Men's  | TRUE   | 12     | pro-set| Jack, Lynn, ...
 *
 *   Format:
 *     "pro-set"    -> single 8-game pro set (first to 8)
 *     "best-of-3"  -> best of 3 traditional sets
 *
 *   Players = comma-separated list.
 *   Active  = TRUE to show in the app, FALSE to hide.
 *
 *   No code changes required.
 *
 * -- Match tab schema (auto-created) ------------------------
 *   "<Ladder Name> - Matches" columns:
 *     Date | Round | Winner | Learner |
 *     Winner Sets | Learner Sets | Winner Games | Learner Games |
 *     Score | Format | Submitted At
 *
 * -- Manual double-check tab (auto-created) -----------------
 *   "<Ladder Name> - Manual" - a round-by-round spreadsheet view
 *   for sanity-checking the app's standings. Every cell is a
 *   live formula pulling from the Matches tab - no manual entry.
 *
 *   This app is currently pro-set / games-only. Layout:
 *     Rank | Player | Games Win % |
 *     R1 Games W | R1 Games L | ... (xrounds) |
 *     Total Games W | Total Games L
 *
 *   NOTE: `doPost` still records Winner Sets / Learner Sets in
 *   the Matches tab, and `calculateStandings` still supports
 *   best-of-3 sort logic. That back-end support is dormant but
 *   intentionally preserved in case this codebase is ever
 *   repurposed for a doubles/best-of-3 ladder in the future.
 *
 *   Created automatically the first time a match is logged
 *   for a ladder. If you add/remove players in the Ladders
 *   config, run `setupAllManualWorksheets` from the editor
 *   to rebuild every manual tab.
 */

// ===========================================================
//  SETUP - run this once from the Apps Script editor
// ===========================================================
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

// ===========================================================
//  HELPERS
// ===========================================================
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

  // Keep the Score column (I) as plain text so scores like "8-3"
  // aren't auto-converted into dates by Google Sheets.
  sheet.getRange(1, 9, sheet.getMaxRows(), 1).setNumberFormat('@');

  return sheet;
}

// Recover a Score value that Google Sheets auto-converted into a date.
// "8-3" became Aug 3 -> month (8) = winner games, day (3) = learner games.
function fixScoreValue(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return (v.getMonth() + 1) + '-' + v.getDate();
  }
  return String(v == null ? '' : v);
}

// One-time repair: rewrites date-converted Score cells back to text
// on every active ladder's Matches tab and locks the column to text.
function repairScoreColumns() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ladders = getLaddersConfig();
  var fixed = 0, tabs = 0;
  ladders.forEach(function(l) {
    var sheet = ss.getSheetByName(l.name + ' - Matches');
    if (!sheet || sheet.getLastRow() < 2) return;
    tabs++;
    var range = sheet.getRange(2, 9, sheet.getLastRow() - 1, 1);
    var vals = range.getValues();
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i][0];
      if (Object.prototype.toString.call(v) === '[object Date]') fixed++;
      vals[i][0] = fixScoreValue(v);
    }
    sheet.getRange(1, 9, sheet.getMaxRows(), 1).setNumberFormat('@');
    range.setValues(vals);
  });
  SpreadsheetApp.getUi().alert(
    'Score column repaired on ' + tabs + ' Matches tab(s).\n' +
    fixed + ' date-converted score(s) restored to plain text.'
  );
}

// ===========================================================
//  POST - log a match result
// ===========================================================
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

    // Re-write the Score cell as plain text so a score like "8-3"
    // is never re-interpreted as a date by Google Sheets.
    var lastRow = sheet.getLastRow();
    var scoreCell = sheet.getRange(lastRow, 9);
    scoreCell.setNumberFormat('@');
    scoreCell.setValue(scoreStr);

    // Keep the manual double-check tab in sync (cheap if it already exists)
    try { ensureManualSheet(data.ladder); } catch (e) { /* non-fatal */ }

    return jsonOut({ status: 'ok' });

  } catch (err) {
    return jsonOut({ status: 'error', message: err.toString() });
  }
}

// ===========================================================
//  GET - list ladders OR return standings for a ladder
// ===========================================================
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

// ===========================================================
//  STANDINGS CALCULATION
// ===========================================================
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
      var scoreStr= fixScoreValue(rows[r][8]);
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
  //   pro-set   -> games win % > fewest games lost > most games won
  //   best-of-3 -> sets %      > games %           > net games
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

  // Ensure the manual double-check tab exists (cheap if already present)
  try { ensureManualSheet(ladderName); } catch (e) { /* non-fatal */ }

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

  // Current round + pending players
  var numPairs = Math.floor(ladder.players.length / 2);
  var matchesPerRound = {};
  var playersPerRound = {};
  // Use all rows (recent is reversed; re-scan stats which used original rows order)
  // Re-derive from recent (reversed back) - easier to just use the stats loop data we already have
  // Walk recent in reverse to get original order
  var allRecent = recent.slice().reverse();
  for (var ri = 0; ri < allRecent.length; ri++) {
    var rm = allRecent[ri];
    var rnd = Number(rm.round);
    if (!rnd) continue;
    matchesPerRound[rnd] = (matchesPerRound[rnd] || 0) + 1;
    if (!playersPerRound[rnd]) playersPerRound[rnd] = {};
    playersPerRound[rnd][rm.winner]  = true;
    playersPerRound[rnd][rm.learner] = true;
  }

  var currentRound = 1;
  for (var rn = 1; rn <= ladder.rounds; rn++) {
    var cnt = matchesPerRound[rn] || 0;
    if (cnt < numPairs) { currentRound = rn; break; }
    if (rn === ladder.rounds) currentRound = ladder.rounds; // all rounds done
  }

  var playedNow = playersPerRound[currentRound] || {};
  var pendingPlayers = ladder.players.filter(function(p) { return !playedNow[p]; });

  return {
    status: 'ok',
    ladder: ladderName,
    format: ladder.format,
    rounds: ladder.rounds,
    standings: standings,
    matchups: matchups,
    recent: recentMatches,
    currentRound: currentRound,
    pendingPlayers: pendingPlayers
  };
}

// ===========================================================
//  MANUAL WORKSHEET - auto-populated double-check tab
//  Mirrors the old "2025 Doubles CC Men's Ladder Standings"
//  CSV layout: Rank | Player | Sets Win % | Games Win % |
//  Rn Sets W | Rn Sets L | Rn Games W | Rn Games L (xrounds) |
//  Total Sets W | Total Sets L | Total Games W | Total Games L
//
//  Every cell except the Player column is a live formula that
//  reads from the "<Ladder> - Matches" tab. Nothing to type.
// ===========================================================
function ensureManualSheet(ladderName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabName = ladderName + ' - Manual';
  if (ss.getSheetByName(tabName)) return; // already exists, leave it alone
  buildManualSheet(ladderName);
}

function buildManualSheet(ladderName) {
  var ladder = getLadderByName(ladderName);
  if (!ladder) throw new Error('Ladder not found: ' + ladderName);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabName = ladderName + ' - Manual';
  var existing = ss.getSheetByName(tabName);
  if (existing) ss.deleteSheet(existing);
  var sheet = ss.insertSheet(tabName);

  // Escape any apostrophes in the ladder name (e.g. "Men's") by doubling them,
  // otherwise the single-quoted sheet reference in the formulas breaks.
  var matchesTab = "'" + ladderName.replace(/'/g, "''") + " - Matches'";
  var rounds = ladder.rounds;
  var players = ladder.players;
  var numPlayers = players.length;

  // -- Header row (games-only layout) -----------------------
  var headers = ['Rank', 'Player', 'Games Win %'];
  for (var r = 1; r <= rounds; r++) {
    headers.push('R' + r + ' Games W', 'R' + r + ' Games L');
  }
  headers.push('Total Games W', 'Total Games L');

  var totalCols = headers.length;
  var totalStartCol = 4 + rounds * 2; // 1-indexed column of "Total Games W"

  sheet.getRange(1, 1, 1, totalCols)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#052d54')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);

  if (numPlayers === 0) return sheet;

  var lastRow = numPlayers + 1;
  var rankColLetter = 'C'; // Games Win %

  // -- Build 2D row array of values + formulas --------------
  var rowData = [];
  for (var i = 0; i < numPlayers; i++) {
    var rowNum = i + 2;
    var row = new Array(totalCols);
    var pCell = '$B' + rowNum;

    // Col 1: Rank (by Games Win %)
    row[0] = '=IFERROR(RANK(' + rankColLetter + rowNum +
             ',$' + rankColLetter + '$2:$' + rankColLetter + '$' + lastRow + '),"")';

    // Col 2: Player name (literal)
    row[1] = players[i];

    // Per-round SUMIFS formulas (games only)
    // Matches tab columns: B=Round, C=Winner, D=Learner,
    //                      G=WinnerGames, H=LearnerGames
    for (var rd = 1; rd <= rounds; rd++) {
      var base = 3 + (rd - 1) * 2; // 0-indexed slot in row array

      // Games W for this player this round
      row[base] =
        '=SUMIFS(' + matchesTab + '!G:G,' + matchesTab + '!B:B,' + rd + ',' + matchesTab + '!C:C,' + pCell + ')' +
        '+SUMIFS(' + matchesTab + '!H:H,' + matchesTab + '!B:B,' + rd + ',' + matchesTab + '!D:D,' + pCell + ')';

      // Games L for this player this round
      row[base + 1] =
        '=SUMIFS(' + matchesTab + '!H:H,' + matchesTab + '!B:B,' + rd + ',' + matchesTab + '!C:C,' + pCell + ')' +
        '+SUMIFS(' + matchesTab + '!G:G,' + matchesTab + '!B:B,' + rd + ',' + matchesTab + '!D:D,' + pCell + ')';
    }

    // Totals - sum the interleaved round columns
    var gamesW = [], gamesL = [];
    for (var rd2 = 1; rd2 <= rounds; rd2++) {
      var b = 4 + (rd2 - 1) * 2;
      gamesW.push(colLetter(b) + rowNum);
      gamesL.push(colLetter(b + 1) + rowNum);
    }
    row[totalStartCol - 1] = '=' + gamesW.join('+'); // Total Games W
    row[totalStartCol]     = '=' + gamesL.join('+'); // Total Games L

    // Cell refs to the totals we just wrote
    var tgwCell = colLetter(totalStartCol)     + rowNum;
    var tglCell = colLetter(totalStartCol + 1) + rowNum;

    // Col 3: Games Win %
    row[2] = '=IFERROR(' + tgwCell + '/(' + tgwCell + '+' + tglCell + '),0)';

    rowData.push(row);
  }

  sheet.getRange(2, 1, numPlayers, totalCols).setValues(rowData);

  // -- Formatting ------------------------------------------
  sheet.getRange(2, 3, numPlayers, 1).setNumberFormat('0.00%');
  sheet.setColumnWidth(1, 55);
  sheet.setColumnWidth(2, 170);
  sheet.setColumnWidth(3, 100);
  for (var c = 4; c < totalStartCol; c++) {
    sheet.setColumnWidth(c, 60);
  }
  for (var c2 = totalStartCol; c2 < totalStartCol + 2; c2++) {
    sheet.setColumnWidth(c2, 90);
  }

  return sheet;
}

// Run this from the Apps Script editor any time you add/remove
// players in the Ladders config, or add a new ladder.
function setupAllManualWorksheets() {
  var ladders = getLaddersConfig();
  var count = 0;
  for (var i = 0; i < ladders.length; i++) {
    if (!ladders[i].active) continue;
    buildManualSheet(ladders[i].name);
    count++;
  }
  SpreadsheetApp.getUi().alert(
    'Rebuilt ' + count + ' manual worksheet(s).\n\n' +
    'Each active ladder now has a "<Ladder> - Manual" tab with ' +
    'live formulas pulling from its Matches tab.'
  );
}

// Convert 1-indexed column number to A1 letter (A, B, ..., Z, AA, AB, ...)
function colLetter(col) {
  var letter = '';
  while (col > 0) {
    var mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - mod) / 26);
  }
  return letter;
}

// ===========================================================
//  USTA RATINGS + LEVEL REPORT
//
//  "USTA Ratings" tab: one row per player (Player | USTA Rating).
//  The setup function pre-fills every rostered player from the
//  active ladders - you just type each player's rating next to
//  their name. Re-running it adds any new players without
//  touching ratings you've already entered.
//
//  "<Ladder> - USTA Report" tab: final standings broken into a
//  section per USTA level, each ranked the same way the app
//  ranks (Games Win %, then fewest games lost). Players with no
//  rating are listed in a "No Rating" section at the bottom.
// ===========================================================
var USTA_RATINGS_TAB = 'USTA Ratings';

function setupUstaRatingsTab() {
  var added = ensureUstaRatingsTab();
  SpreadsheetApp.getUi().alert(
    'The "' + USTA_RATINGS_TAB + '" tab is ready' +
    (added > 0 ? ' (' + added + ' player(s) added)' : '') + '.\n\n' +
    '1. Type each player\'s USTA rating (e.g. 3.5, 4.0).\n' +
    '2. Mark Charged? Yes for everyone paying into the pot.\n' +
    '3. Enter each player\'s fee in the Entry Fee ($) column.\n\n' +
    'Then run "Refresh USTA Level Report" from the Ladder Tools menu.'
  );
}

// Creates the tab if needed and appends any rostered players that
// aren't listed yet. Existing rows/ratings/charges are left untouched.
// Returns how many players were added.
function ensureUstaRatingsTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(USTA_RATINGS_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(USTA_RATINGS_TAB);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 110);
    sheet.setColumnWidth(3, 100);
    sheet.setColumnWidth(4, 120);
    sheet.setColumnWidth(5, 100);
  }

  // Headers (re-applied so older versions of this tab pick up new columns)
  sheet.getRange(1, 1, 1, 4)
    .setValues([['Player', 'USTA Rating', 'Charged?', 'Entry Fee ($)']])
    .setFontWeight('bold')
    .setBackground('#052d54')
    .setFontColor('#ffffff');

  // Entry fee is per player, typed in column D next to each name
  sheet.getRange(2, 4, 1000, 1).setNumberFormat('$#,##0.00');

  // Yes/No dropdown for the Charged? column
  var yesNo = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Yes', 'No'], true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, 3, 1000, 1).setDataValidation(yesNo);

  // Players already listed
  var listed = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
      .forEach(function(r) {
        var n = String(r[0] || '').trim();
        if (n) listed[n] = true;
      });
  }

  // Union of rosters across active ladders (skip "Sub")
  var seen = {}, missing = [];
  getLaddersConfig().forEach(function(l) {
    if (!l.active) return;
    l.players.forEach(function(p) {
      if (p && p !== 'Sub' && !seen[p]) {
        seen[p] = true;
        if (!listed[p]) missing.push(p);
      }
    });
  });
  missing.sort(function(a, b) { return a.localeCompare(b); });

  if (missing.length > 0) {
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, missing.length, 1)
      .setValues(missing.map(function(p) { return [p]; }));
  }
  return missing.length;
}

// Read the pot config from the USTA Ratings tab: which players are
// marked Charged? = Yes, and each player's entry fee (column D).
function getUstaPotInfo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(USTA_RATINGS_TAB);
  var info = { charged: {}, fees: {} };
  if (!sheet || sheet.getLastRow() < 2) return info;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues()
    .forEach(function(r) {
      var name = String(r[0] || '').trim();
      var yes  = String(r[2] || '').trim().toLowerCase() === 'yes';
      if (name && yes) {
        info.charged[name] = true;
        info.fees[name] = Number(r[3]) || 0;
      }
    });
  return info;
}

// Format a number as dollars.
function money(n) {
  return '$' + Number(n || 0).toFixed(2);
}

// Normalize a rating so "4", 4.0 and "4.0" all match: numeric ratings
// become one-decimal strings ("3.0", "3.5", "4.0"); anything else is
// kept as trimmed text.
function normLevel(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  var n = parseFloat(s);
  if (!isNaN(n) && /^[0-9.]+$/.test(s)) return n.toFixed(1);
  return s;
}

// ===========================================================
//  POT GROUPS - combine USTA levels into shared pots
//  "Pot Groups" tab: one row per pot (Pot Name | USTA Levels).
//  Levels not listed in any group get their own pot automatically.
//  Leave the tab empty (or delete it) for one pot per level.
// ===========================================================
var POT_GROUPS_TAB = 'Pot Groups';

function setupPotGroupsTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(POT_GROUPS_TAB);
  var created = false;
  if (!sheet) {
    sheet = ss.insertSheet(POT_GROUPS_TAB);
    created = true;
  }
  sheet.getRange(1, 1, 1, 2)
    .setValues([['Pot Name', 'USTA Levels (comma-separated)']])
    .setFontWeight('bold')
    .setBackground('#052d54')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 260);

  // Example rows on first creation only - edit to your real setup
  if (created) {
    sheet.getRange(2, 1, 2, 2).setValues([
      ['3.0 Pot', '3.0'],
      ['3.5/4.0 Pot', '3.5, 4.0']
    ]);
  }

  SpreadsheetApp.getUi().alert(
    'The "' + POT_GROUPS_TAB + '" tab is ready.\n\n' +
    'One row per pot: name it, then list the USTA level(s) it covers, ' +
    'comma-separated (e.g. "3.5, 4.0").\n\n' +
    'Levels you don\'t list get their own pot automatically. ' +
    'Clear the rows to go back to one pot per level.\n\n' +
    'Run "Refresh USTA Level Report" to apply.'
  );
}

// Read pot groups from the tab. Returns [{ name, levels: [] }].
function getPotGroups() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(POT_GROUPS_TAB);
  var groups = [];
  if (!sheet || sheet.getLastRow() < 2) return groups;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues()
    .forEach(function(r) {
      var name = String(r[0] || '').trim();
      var levels = String(r[1] || '')
        .split(',')
        .map(function(s) { return normLevel(s); })
        .filter(function(s) { return s.length > 0; });
      if (name && levels.length > 0) groups.push({ name: name, levels: levels });
    });
  return groups;
}

// Read the ratings tab into a { playerName: rating } map.
function getUstaRatings() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(USTA_RATINGS_TAB);
  var map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues()
    .forEach(function(r) {
      var name = String(r[0] || '').trim();
      var rating = String(r[1] || '').trim();
      if (name && rating) map[name] = rating;
    });
  return map;
}

// Per-player round participation for a ladder.
// Returns { totalRounds: N, missed: { playerName: count } } where
// totalRounds counts only rounds with at least one recorded match.
function getRoundParticipation(ladderName) {
  var ladder = getLadderByName(ladderName);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ladderName + ' - Matches');

  var allRounds = {};                 // every round that has any match
  var playerRounds = {};              // player -> set of rounds played
  ladder.players.forEach(function(p) { playerRounds[p] = {}; });

  if (sheet && sheet.getLastRow() > 1) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    rows.forEach(function(r) {
      var round = String(r[1]);
      if (!round) return;
      allRounds[round] = true;
      var winner = r[2], learner = r[3];
      if (playerRounds[winner])  playerRounds[winner][round]  = true;
      if (playerRounds[learner]) playerRounds[learner][round] = true;
    });
  }

  var totalRounds = Object.keys(allRounds).length;
  var missed = {};
  ladder.players.forEach(function(p) {
    missed[p] = totalRounds - Object.keys(playerRounds[p]).length;
  });
  return { totalRounds: totalRounds, missed: missed };
}

// Build the "<Ladder> - USTA Report" tab for one ladder.
// potGroupsOverride (optional): pot groups typed at report time;
// falls back to the Pot Groups tab when not provided.
function writeUstaReport(ladderName, potGroupsOverride) {
  var result = calculateStandings(ladderName);
  var standings = result.standings; // already in ranked order
  var ratings = getUstaRatings();
  var participation = getRoundParticipation(ladderName);
  var pot = getUstaPotInfo();

  // Group players by rating level, preserving overall rank order
  var groups = {}, levels = [];
  standings.forEach(function(p) {
    var level = normLevel(ratings[p.name]) || 'No Rating';
    if (!groups[level]) { groups[level] = []; levels.push(level); }
    groups[level].push(p);
  });

  // Sort levels numerically when possible; "No Rating" always last
  levels.sort(function(a, b) {
    if (a === 'No Rating') return 1;
    if (b === 'No Rating') return -1;
    var na = parseFloat(a), nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabName = ladderName + ' - USTA Report';
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) sheet = ss.insertSheet(tabName); else sheet.clear();

  var NCOLS = 8;
  var row = 1;

  levels.forEach(function(level) {
    // Section title
    sheet.getRange(row, 1, 1, NCOLS)
      .merge()
      .setValue(level === 'No Rating' ? 'No Rating - add these players to the USTA Ratings tab' : 'USTA ' + level)
      .setFontWeight('bold')
      .setBackground('#052d54')
      .setFontColor('#ffffff');
    row++;

    // Column headers
    sheet.getRange(row, 1, 1, NCOLS)
      .setValues([['Rank', 'Player', 'Games Win %', 'Games W', 'Games L', 'Matches', 'Rounds Missed', 'Eligible']])
      .setFontWeight('bold')
      .setBackground('#e3edf7')
      .setFontColor('#052d54');
    row++;

    // Player rows - ranked within the level (standings order is preserved).
    // Eligibility: missing more than one round = ineligible to win.
    var data = groups[level].map(function(p, i) {
      var missed = participation.missed[p.name] || 0;
      var eligible = missed <= 1;
      return [i + 1, p.name, p.gamesPct, p.gamesWon, p.gamesLost, p.matches,
              missed, eligible ? '\u2713' : '\u2717 Ineligible'];
    });
    sheet.getRange(row, 1, data.length, NCOLS).setValues(data);
    sheet.getRange(row, 3, data.length, 1).setNumberFormat('0.00%');

    // Gray out ineligible rows so eligible winners stand out
    data.forEach(function(d, i) {
      if (d[7] !== '\u2713') {
        sheet.getRange(row + i, 1, 1, NCOLS).setFontColor('#999999');
      }
    });

    // -- Warning for charged-but-unrated players -------------
    var summary = [];
    if (level === 'No Rating') {
      var chargedHere = groups[level].filter(function(p) { return pot.charged[p.name]; });
      if (chargedHere.length > 0) {
        summary.push('\u26A0 ' + chargedHere.length + ' charged player(s) here have no rating - add them to the USTA Ratings tab so their entry joins a pot.');
      }
    }
    summary.forEach(function(text, i) {
      sheet.getRange(row + data.length + i, 1, 1, NCOLS)
        .merge()
        .setValue(text)
        .setFontWeight('bold')
        .setBackground('#f0f6ff')
        .setFontColor('#052d54');
    });

    row += data.length + summary.length + 1; // blank row between sections
  });

  // === POTS & PAYOUTS ======================================
  // Pots come from the "Pot Groups" tab; levels not covered by
  // any group each get their own pot automatically.
  var potsToRender = [];
  var covered = {};
  var potGroups = potGroupsOverride || getPotGroups();
  potGroups.forEach(function(g) {
    potsToRender.push(g);
    g.levels.forEach(function(l) { covered[l] = true; });
  });
  levels.forEach(function(l) {
    if (l !== 'No Rating' && !covered[l]) {
      potsToRender.push({ name: 'USTA ' + l + ' Pot', levels: [l] });
    }
  });

  if (potsToRender.length > 0) {
    sheet.getRange(row, 1, 1, NCOLS)
      .merge()
      .setValue('\uD83D\uDCB0 POTS & PAYOUTS')
      .setFontWeight('bold')
      .setBackground('#052d54')
      .setFontColor('#ffffff');
    row++;

    potsToRender.forEach(function(pg) {
      // Members: everyone whose rating falls in this pot's levels,
      // already in overall standings order.
      var members = standings.filter(function(p) {
        return pg.levels.indexOf(normLevel(ratings[p.name])) !== -1;
      });
      var charged = members.filter(function(p) { return pot.charged[p.name]; });
      var total = charged.reduce(function(sum, p) {
        return sum + (pot.fees[p.name] || 0);
      }, 0);
      // When every charged player pays the same fee, show "N x $F"
      var uniformFee = charged.length > 0 ? (pot.fees[charged[0].name] || 0) : 0;
      var allSameFee = charged.every(function(p) {
        return (pot.fees[p.name] || 0) === uniformFee;
      });
      var elig = members.filter(function(p) {
        return (participation.missed[p.name] || 0) <= 1;
      });

      sheet.getRange(row, 1, 1, NCOLS)
        .merge()
        .setValue(pg.name + '  (USTA ' + pg.levels.join(' + ') + ')')
        .setFontWeight('bold')
        .setBackground('#e3edf7')
        .setFontColor('#052d54');
      row++;

      var lines = [];
      if (total > 0) {
        if (allSameFee) {
          lines.push('Pot: ' + charged.length + ' charged x ' + money(uniformFee) + ' = ' + money(total));
        } else {
          lines.push('Pot: ' + charged.length + ' charged = ' + money(total));
        }
      } else {
        lines.push('Pot: ' + charged.length + ' charged - enter each player\'s fee in the Entry Fee ($) column of the USTA Ratings tab');
      }
      lines.push('1st (60%): ' + (elig[0] ? elig[0].name + ' - ' + money(total * 0.6) : '- (no eligible player)'));
      lines.push('2nd (40%): ' + (elig[1] ? elig[1].name + ' - ' + money(total * 0.4) : '- (no eligible player)'));

      lines.forEach(function(text) {
        sheet.getRange(row, 1, 1, NCOLS)
          .merge()
          .setValue(text)
          .setBackground('#f0f6ff')
          .setFontColor('#052d54');
        row++;
      });
      row++; // blank row between pots
    });
  }

  sheet.setColumnWidth(1, 55);
  sheet.setColumnWidth(2, 190);
  sheet.setColumnWidth(3, 110);
  sheet.setColumnWidth(4, 80);
  sheet.setColumnWidth(5, 80);
  sheet.setColumnWidth(6, 80);
  sheet.setColumnWidth(7, 110);
  sheet.setColumnWidth(8, 105);

  return sheet;
}

// Opens the pot picker dialog: every USTA level gets a "Pot" dropdown -
// levels assigned the same pot share one pot. No typing needed.
function refreshUstaReports() {
  ensureUstaRatingsTab(); // pick up any newly added players

  // Distinct levels present on the USTA Ratings tab
  var ratings = getUstaRatings();
  var levelSet = {};
  Object.keys(ratings).forEach(function(name) {
    var l = normLevel(ratings[name]);
    if (l) levelSet[l] = true;
  });
  var levels = Object.keys(levelSet).sort(function(a, b) {
    var na = parseFloat(a), nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  if (levels.length === 0) {
    SpreadsheetApp.getUi().alert(
      'No USTA ratings entered yet - fill in the USTA Ratings tab first.'
    );
    return;
  }

  // Pre-select each level's pot from the saved Pot Groups tab
  var defaults = levels.map(function(_, i) { return i; }); // own pot each
  var saved = getPotGroups();
  if (saved.length > 0) {
    var map = {}, next = saved.length;
    saved.forEach(function(g, gi) {
      g.levels.forEach(function(l) { map[l] = gi; });
    });
    defaults = levels.map(function(l) {
      if (map.hasOwnProperty(l)) return map[l];
      return Math.min(next++, levels.length - 1); // unlisted -> its own pot
    });
  }

  var html = buildPotPickerHtml(levels, defaults);
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html)
      .setWidth(380)
      .setHeight(210 + levels.length * 42),
    'USTA Level Report - choose pots'
  );
}

// HTML for the pot picker dialog.
function buildPotPickerHtml(levels, defaults) {
  var rows = levels.map(function(l, i) {
    var opts = levels.map(function(_, p) {
      return '<option value="' + p + '"' +
             (defaults[i] === p ? ' selected' : '') +
             '>Pot ' + (p + 1) + '</option>';
    }).join('');
    return '<tr><td class="lvl">USTA ' + l + '</td>' +
           '<td><select id="sel' + i + '">' + opts + '</select></td></tr>';
  }).join('');

  return '<!DOCTYPE html><html><head><style>' +
    'body{font-family:Arial,sans-serif;margin:14px;color:#1a1a1a;}' +
    '.hint{font-size:13px;color:#555;margin-bottom:10px;}' +
    'table{border-collapse:collapse;width:100%;}' +
    'td{padding:6px 4px;font-size:14px;}' +
    'td.lvl{font-weight:bold;color:#052d54;width:45%;}' +
    'select{padding:6px 10px;font-size:14px;border:1px solid #ccc;border-radius:6px;width:100%;}' +
    'label{display:block;margin:12px 0;font-size:13px;color:#555;}' +
    '.btns{display:flex;gap:8px;}' +
    'button{flex:1;padding:10px;font-size:14px;font-weight:bold;border:none;border-radius:8px;cursor:pointer;}' +
    '#run{background:#052d54;color:#fff;}' +
    '#run:disabled{opacity:0.5;}' +
    '#cancel{background:#eee;color:#555;}' +
    '#status{margin-top:10px;font-size:13px;color:#052d54;font-weight:bold;min-height:18px;}' +
    '</style></head><body>' +
    '<div class="hint">Levels set to the same pot share one pot (1st gets 60%, 2nd gets 40%).</div>' +
    '<table>' + rows + '</table>' +
    '<label><input type="checkbox" id="save"> Save this grouping as the default (Pot Groups tab)</label>' +
    '<div class="btns">' +
    '<button id="run" onclick="run()">Run Report</button>' +
    '<button id="cancel" onclick="google.script.host.close()">Cancel</button>' +
    '</div>' +
    '<div id="status"></div>' +
    '<script>' +
    'var LEVELS=' + JSON.stringify(levels) + ';' +
    'function run(){' +
      'var a={};' +
      'for(var i=0;i<LEVELS.length;i++){a[LEVELS[i]]=Number(document.getElementById("sel"+i).value);}' +
      'document.getElementById("run").disabled=true;' +
      'document.getElementById("status").textContent="Building report(s)...";' +
      'google.script.run' +
        '.withSuccessHandler(function(msg){' +
          'document.getElementById("status").textContent=msg;' +
          'setTimeout(function(){google.script.host.close();},2000);' +
        '})' +
        '.withFailureHandler(function(err){' +
          'document.getElementById("run").disabled=false;' +
          'document.getElementById("status").textContent="Error: "+err.message;' +
        '})' +
        '.runUstaReportGrouped({assignments:a,saveDefault:document.getElementById("save").checked});' +
    '}' +
    '</scr' + 'ipt></body></html>';
}

// Called from the pot picker dialog. Builds pot groups from the
// level -> pot assignments, optionally saves them as the new default,
// then rebuilds the USTA report for every active ladder.
function runUstaReportGrouped(payload) {
  var byPot = {};
  Object.keys(payload.assignments).forEach(function(level) {
    var p = payload.assignments[level];
    if (!byPot[p]) byPot[p] = [];
    byPot[p].push(level);
  });

  var groups = Object.keys(byPot)
    .sort(function(a, b) { return Number(a) - Number(b); })
    .map(function(p) {
      var lv = byPot[p];
      lv.sort(function(a, b) {
        var na = parseFloat(a), nb = parseFloat(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });
      return { name: 'USTA ' + lv.join('/') + ' Pot', levels: lv };
    });

  if (payload.saveDefault) writePotGroupsTab(groups);

  var ladders = getLaddersConfig();
  var done = [], failed = [];
  for (var i = 0; i < ladders.length; i++) {
    if (!ladders[i].active) continue;
    try {
      writeUstaReport(ladders[i].name, groups);
      done.push(ladders[i].name);
    } catch (e) {
      failed.push(ladders[i].name + ' - ' + e);
    }
  }
  var msg = 'Report refreshed for: ' + (done.join(', ') || '(none)');
  if (failed.length) msg += ' - FAILED: ' + failed.join('; ');
  return msg;
}

// Overwrite the Pot Groups tab with the given groups (used by the
// dialog's "save as default" checkbox).
function writePotGroupsTab(groups) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(POT_GROUPS_TAB);
  if (!sheet) sheet = ss.insertSheet(POT_GROUPS_TAB);
  sheet.clear();
  sheet.getRange(1, 1, 1, 2)
    .setValues([['Pot Name', 'USTA Levels (comma-separated)']])
    .setFontWeight('bold')
    .setBackground('#052d54')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  if (groups.length > 0) {
    sheet.getRange(2, 1, groups.length, 2).setValues(groups.map(function(g) {
      return [g.name, g.levels.join(', ')];
    }));
  }
}

// "Ladder Tools" menu for on-demand actions.
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Ladder Tools')
    .addItem('Refresh USTA Level Report', 'refreshUstaReports')
    .addItem('Set up / Refresh USTA Ratings tab', 'setupUstaRatingsTab')
    .addItem('Set up Pot Groups (combine levels)', 'setupPotGroupsTab')
    .addItem('Rebuild Manual Worksheets', 'setupAllManualWorksheets')
    .addItem('Repair Score column (date fix)', 'repairScoreColumns')
    .addToUi();
}
