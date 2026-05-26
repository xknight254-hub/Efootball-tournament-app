export interface User {
    id: number;
    username: string;
    email: string;
    password_hash: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    is_admin: number;
    is_super_admin: number;
    created_at: string;
}
export interface Tournament {
    id: number;
    name: string;
    description: string | null;
    platform: string;
    format: 'knockout' | 'league';
    max_players: number;
    best_of: number;
    status: 'open' | 'check_in' | 'fixtures_ready' | 'in_progress' | 'completed';
    owner_id: number;
    winner_id: number | null;
    prize_pool: string | null;
    registration_deadline: string | null;
    result_deadline_hours: number;
    rules: string | null;
    created_at: string;
}
export interface TournamentParticipant {
    id: number;
    tournament_id: number;
    user_id: number;
    status: 'registered' | 'checked_in' | 'ready' | 'eliminated' | 'winner' | 'runner_up';
    seed: number | null;
    checked_in_at: string | null;
    joined_at: string;
}
export interface Match {
    id: number;
    tournament_id: number;
    player1_id: number;
    player2_id: number | null;
    round: number;
    match_number: number;
    player1_score: number | null;
    player2_score: number | null;
    winner_id: number | null;
    status: 'pending' | 'playing' | 'completed' | 'disputed';
    confirmation_status: 'pending' | 'confirmed' | 'disputed';
    submitted_by: number | null;
    submitted_at: string | null;
    confirmed_at: string | null;
    screenshot_url: string | null;
    opponent_screenshot_url: string | null;
    created_at: string;
}
export interface Standings {
    id: number;
    tournament_id: number;
    team_name: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    gd: number;
    points: number;
}
export interface TournamentWithDetails extends Tournament {
    owner_name: string;
    winner_name: string | null;
    player_count: number;
    checked_in_count?: number;
}
export interface ParticipantWithUser extends TournamentParticipant {
    username: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
}
export interface MatchWithPlayers extends Match {
    player1_name: string;
    player1_username: string;
    player2_name: string | null;
    player2_username: string | null;
}
//# sourceMappingURL=types.d.ts.map