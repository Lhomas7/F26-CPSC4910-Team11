// Window events the API client sends so AuthContext can track the session
// without every page handling expiry itself.
export const API_ACTIVITY_EVENT = 'gd:api-activity';
export const SESSION_EXPIRED_EVENT = 'gd:session-expired';
