import db from '../db.js';
import { getIO } from '../socket/index.js';
import { shouldNotify } from '../services/notificationPreferences.js';
import { sendTelegramNotification } from '../services/telegramPush.js';
/**
 * Create an in-app notification and optionally send a Telegram push.
 */
function createNotification(userId, title, body, type) {
    db.prepare('INSERT INTO notifications (user_id, title, body, type) VALUES (?, ?, ?, ?)').run(userId, title, body, type);
    // Send Telegram push asynchronously (fire and forget)
    const user = db.prepare('SELECT telegram_id FROM users WHERE id = ?').get(userId);
    if (user?.telegram_id) {
        const emojiMap = { result: '🎮', tournament: '🏆', payment: '💰' };
        sendTelegramNotification(user.telegram_id, (emojiMap[type] || '🔔') + ' <b>' + title + '</b>\n' + body);
    }
}
export async function getTournamentMatches(req, res) {
    const { tournamentId } = req.params;
    const tid = parseInt(tournamentId);
    if (isNaN(tid)) {
        return res.status(400).json({ error: 'Invalid tournament ID' });
    }
    const matches = db.prepare(`
    SELECT m.*, 
           p1.username as player1_username,
           p2.username as player2_username,
           w.username as winner_username
    FROM matches m
    LEFT JOIN users p1 ON m.player1_id = p1.id
    LEFT JOIN users p2 ON m.player2_id = p2.id
    LEFT JOIN users w ON m.winner_id = w.id
    WHERE m.tournament_id = ?
    ORDER BY m.round, m.match_number
  `).all(tid);
    res.json({
        matches: matches.map(m => ({
            id: m.id,
            round: m.round,
            matchNumber: m.match_number,
            player1: m.player1_id ? { id: m.player1_id, username: m.player1_username, team: m.player1_team } : null,
            player2: m.player2_id ? { id: m.player2_id, username: m.player2_username, team: m.player2_team } : null,
            player1Team: m.player1_team,
            player2Team: m.player2_team,
            player1Score: m.player1_score,
            player2Score: m.player2_score,
            winner: m.winner_id ? { id: m.winner_id, username: m.winner_username } : null,
            status: m.status,
            confirmationStatus: m.confirmation_status,
            verificationStatus: m.verification_status || 'none',
            submittedBy: m.submitted_by,
            submittedAt: m.submitted_at,
            confirmedAt: m.confirmed_at,
            screenshotUrl: m.screenshot_url,
            opponentScreenshotUrl: m.opponent_screenshot_url,
            createdAt: m.created_at
        }))
    });
}
export async function getMatchById(req, res) {
    const { id } = req.params;
    const matchId = parseInt(id);
    if (isNaN(matchId)) {
        return res.status(400).json({ error: 'Invalid match ID' });
    }
    const match = db.prepare(`
    SELECT m.*, 
           p1.username as player1_username,
           p2.username as player2_username,
           w.username as winner_username,
           sub.username as submitted_by_username
    FROM matches m
    LEFT JOIN users p1 ON m.player1_id = p1.id
    LEFT JOIN users p2 ON m.player2_id = p2.id
    LEFT JOIN users w ON m.winner_id = w.id
    LEFT JOIN users sub ON m.submitted_by = sub.id
    WHERE m.id = ?
  `).get(matchId);
    if (!match) {
        return res.status(404).json({ error: 'Match not found' });
    }
    res.json({
        id: match.id,
        tournamentId: match.tournament_id,
        round: match.round,
        matchNumber: match.match_number,
        player1: match.player1_id ? { id: match.player1_id, username: match.player1_username, team: match.player1_team } : null,
        player2: match.player2_id ? { id: match.player2_id, username: match.player2_username, team: match.player2_team } : null,
        player1Team: match.player1_team,
        player2Team: match.player2_team,
        player1Score: match.player1_score,
        player2Score: match.player2_score,
        winner: match.winner_id ? { id: match.winner_id, username: match.winner_username } : null,
        status: match.status,
        confirmationStatus: match.confirmation_status,
        verificationStatus: match.verification_status || 'none',
        submittedBy: match.submitted_by ? { id: match.submitted_by, username: match.submitted_by_username } : null,
        submittedAt: match.submitted_at,
        confirmedAt: match.confirmed_at,
        screenshotUrl: match.screenshot_url,
        opponentScreenshotUrl: match.opponent_screenshot_url,
        createdAt: match.created_at
    });
}
export async function submitResult(req, res) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const { id } = req.params;
    const matchId = parseInt(id);
    if (isNaN(matchId)) {
        return res.status(400).json({ error: 'Invalid match ID' });
    }
    const { player1Score, player2Score, screenshotUrl } = req.body;
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
    if (!match) {
        return res.status(404).json({ error: 'Match not found' });
    }
    if (match.status === 'completed') {
        return res.status(400).json({ error: 'Match is already completed' });
    }
    const isPlayer1 = match.player1_id === req.user.id;
    const isPlayer2 = match.player2_id === req.user.id;
    if (!isPlayer1 && !isPlayer2) {
        return res.status(403).json({ error: 'You are not a participant in this match' });
    }
    const score1 = isPlayer1 ? player1Score : match.player1_score;
    const score2 = isPlayer2 ? player2Score : match.player2_score;
    const screenshot = isPlayer1 ? screenshotUrl : match.screenshot_url;
    const opponentScreenshot = isPlayer1 ? match.opponent_screenshot_url : screenshotUrl;
    if (score1 === undefined || score2 === undefined) {
        return res.status(400).json({ error: 'Both scores are required' });
    }
    db.prepare(`
    UPDATE matches SET
      player1_score = ?,
      player2_score = ?,
      submitted_by = ?,
      submitted_at = CURRENT_TIMESTAMP,
      screenshot_url = ?,
      opponent_screenshot_url = ?,
      status = 'playing'
    WHERE id = ?
  `).run(isPlayer1 ? player1Score : match.player1_score, isPlayer2 ? player2Score : match.player2_score, req.user.id, screenshot, opponentScreenshot, matchId);
    const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
    const bothSubmitted = updated.player1_score !== null && updated.player2_score !== null;
    // Auto-advance: if deadline passed and only one submitted, they win
    if (!bothSubmitted && updated.deadline_at && new Date(updated.deadline_at) < new Date()) {
        const p1Score = updated.player1_score;
        const p2Score = updated.player2_score;
        if (p1Score !== null && p2Score === null) {
            // Player 1 wins by forfeit
            db.prepare(`
        UPDATE matches SET 
          winner_id = player1_id,
          player2_score = 0,
          status = 'completed',
          confirmation_status = 'confirmed',
          confirmed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(matchId);
        }
        else if (p2Score !== null && p1Score === null) {
            // Player 2 wins by forfeit
            db.prepare(`
        UPDATE matches SET 
          winner_id = player2_id,
          player1_score = 0,
          status = 'completed',
          confirmation_status = 'confirmed',
          confirmed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(matchId);
        }
    }
    if (bothSubmitted && updated.player1_score !== null && updated.player2_score !== null) {
        const p1Wins = updated.player1_score > updated.player2_score;
        const p2Wins = updated.player2_score > updated.player1_score;
        if (p1Wins && !p2Wins) {
            db.prepare(`
        UPDATE matches SET 
          winner_id = player1_id,
          status = 'completed',
          confirmation_status = 'confirmed',
          confirmed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(matchId);
        }
        else if (p2Wins && !p1Wins) {
            db.prepare(`
        UPDATE matches SET 
          winner_id = player2_id,
          status = 'completed',
          confirmation_status = 'confirmed',
          confirmed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(matchId);
        }
        else {
            db.prepare(`
        UPDATE matches SET confirmation_status = 'disputed' WHERE id = ?
      `).run(matchId);
        }
    }
    const result = db.prepare(`
    SELECT m.*, 
           p1.username as player1_username,
           p2.username as player2_username,
           w.username as winner_username
    FROM matches m
    LEFT JOIN users p1 ON m.player1_id = p1.id
    LEFT JOIN users p2 ON m.player2_id = p2.id
    LEFT JOIN users w ON m.winner_id = w.id
    WHERE m.id = ?
  `).get(matchId);
    // Real-time: notify match and tournament rooms
    try {
        const matchRoom = `match:${matchId}`;
        const tournamentRoom = `tournament:${result.tournament_id}`;
        const payload = {
            id: result.id,
            tournamentId: result.tournament_id,
            round: result.round,
            matchNumber: result.match_number,
            player1: { id: result.player1_id, username: result.player1_username },
            player2: { id: result.player2_id, username: result.player2_username },
            player1Score: result.player1_score,
            player2Score: result.player2_score,
            winner: result.winner_id ? { id: result.winner_id, username: result.winner_username } : null,
            status: result.status,
            confirmationStatus: result.confirmation_status,
        };
        getIO().to(matchRoom).to(tournamentRoom).emit('match:update', payload);
    }
    catch { /* socket not initialized */ }
    // Notify opponent about result submission
    try {
        const opponentId = result.player1_id === req.user.id ? result.player2_id : result.player1_id;
        if (opponentId && shouldNotify(opponentId, 'result')) {
            createNotification(opponentId, 'Result Submitted', result.player1_username + ' submitted a result for your match.', 'result');
        }
    }
    catch { /* ignore notification errors */ }
    res.json({
        id: result.id,
        round: result.round,
        matchNumber: result.match_number,
        player1: { id: result.player1_id, username: result.player1_username },
        player2: { id: result.player2_id, username: result.player2_username },
        player1Score: result.player1_score,
        player2Score: result.player2_score,
        winner: result.winner_id ? { id: result.winner_id, username: result.winner_username } : null,
        status: result.status,
        confirmationStatus: result.confirmation_status,
        submittedAt: result.submitted_at,
        confirmedAt: result.confirmed_at
    });
}
export async function confirmResult(req, res) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const { id } = req.params;
    const matchId = parseInt(id);
    if (isNaN(matchId)) {
        return res.status(400).json({ error: 'Invalid match ID' });
    }
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
    if (!match) {
        return res.status(404).json({ error: 'Match not found' });
    }
    const isPlayer1 = match.player1_id === req.user.id;
    const isPlayer2 = match.player2_id === req.user.id;
    if (!isPlayer1 && !isPlayer2) {
        return res.status(403).json({ error: 'You are not a participant in this match' });
    }
    if (match.confirmation_status === 'confirmed') {
        return res.status(400).json({ error: 'Result already confirmed' });
    }
    if (!match.player1_score || !match.player2_score) {
        return res.status(400).json({ error: 'Scores not submitted yet' });
    }
    const p1Wins = match.player1_score > match.player2_score;
    const p2Wins = match.player2_score > match.player1_score;
    if (p1Wins && !p2Wins) {
        db.prepare(`
      UPDATE matches SET 
        winner_id = player1_id,
        status = 'completed',
        confirmation_status = 'confirmed',
        confirmed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(matchId);
    }
    else if (p2Wins && !p1Wins) {
        db.prepare(`
      UPDATE matches SET 
        winner_id = player2_id,
        status = 'completed',
        confirmation_status = 'confirmed',
        confirmed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(matchId);
    }
    const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
    // Real-time: notify match and tournament rooms
    try {
        const tournamentId = match.tournament_id;
        getIO().to(`match:${matchId}`).to(`tournament:${tournamentId}`).emit('match:update', {
            id: matchId,
            tournamentId,
            status: updated.status,
            confirmationStatus: updated.confirmation_status,
            winnerId: updated.winner_id,
        });
    }
    catch { /* socket not initialized */ }
    // Notify both players on confirmation
    try {
        const tournament = db.prepare('SELECT name FROM tournaments WHERE id = ?').get(match.tournament_id);
        const p1 = db.prepare('SELECT username FROM users WHERE id = ?').get(match.player1_id);
        const p2 = db.prepare('SELECT username FROM users WHERE id = ?').get(match.player2_id);
        const winnerName = updated.winner_id === match.player1_id ? (p1?.username || 'Player 1') : (p2?.username || 'Player 2');
        const body = winnerName + ' won in ' + (tournament?.name || 'tournament');
        [match.player1_id, match.player2_id].filter(Boolean).forEach((uid) => {
            if (shouldNotify(uid, 'result')) {
                createNotification(uid, 'Match Complete', body, 'result');
            }
        });
    }
    catch { /* ignore */ }
    res.json({
        id: updated.id,
        status: updated.status,
        confirmationStatus: updated.confirmation_status,
        winnerId: updated.winner_id,
        confirmedAt: updated.confirmed_at
    });
}
export async function disputeResult(req, res) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const { id } = req.params;
    const matchId = parseInt(id);
    if (isNaN(matchId)) {
        return res.status(400).json({ error: 'Invalid match ID' });
    }
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
    if (!match) {
        return res.status(404).json({ error: 'Match not found' });
    }
    const isPlayer1 = match.player1_id === req.user.id;
    const isPlayer2 = match.player2_id === req.user.id;
    if (!isPlayer1 && !isPlayer2) {
        return res.status(403).json({ error: 'You are not a participant in this match' });
    }
    db.prepare(`
    UPDATE matches SET 
      confirmation_status = 'disputed',
      status = 'disputed'
    WHERE id = ?
  `).run(matchId);
    // Real-time: notify match and tournament rooms
    try {
        getIO().to(`match:${matchId}`).to(`tournament:${match.tournament_id}`).emit('match:update', {
            id: matchId,
            tournamentId: match.tournament_id,
            status: 'disputed',
            confirmationStatus: 'disputed',
        });
    }
    catch { /* socket not initialized */ }
    // Notify both players about dispute
    try {
        [match.player1_id, match.player2_id].filter(Boolean).forEach((uid) => {
            if (uid !== req.user.id && shouldNotify(uid, 'result')) {
                createNotification(uid, 'Match Disputed', 'Your match has been disputed and is under review.', 'result');
            }
        });
    }
    catch { /* ignore */ }
    res.json({ message: 'Match disputed. Organizer will review.' });
}
export async function resolveDispute(req, res) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const { id } = req.params;
    const matchId = parseInt(id);
    if (isNaN(matchId)) {
        return res.status(400).json({ error: 'Invalid match ID' });
    }
    const { winnerId } = req.body;
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
    if (!match) {
        return res.status(404).json({ error: 'Match not found' });
    }
    if (match.confirmation_status !== 'disputed') {
        return res.status(400).json({ error: 'Match is not disputed' });
    }
    const validWinner = winnerId === match.player1_id || winnerId === match.player2_id;
    if (!validWinner) {
        return res.status(400).json({ error: 'Winner must be one of the players' });
    }
    db.prepare(`
    UPDATE matches SET 
      winner_id = ?,
      status = 'completed',
      confirmation_status = 'confirmed',
      confirmed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(winnerId, matchId);
    const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
    res.json({
        id: updated.id,
        winnerId: updated.winner_id,
        status: updated.status,
        confirmationStatus: updated.confirmation_status,
        confirmedAt: updated.confirmed_at
    });
}
//# sourceMappingURL=matchController.js.map