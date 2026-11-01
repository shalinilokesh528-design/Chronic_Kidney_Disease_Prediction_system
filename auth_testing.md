# Auth Testing Playbook (Emergent Google Auth)

Reference for the testing agent when validating the /reports auth-gated flow.

## Test User & Session Setup
```bash
mongosh "$MONGO_URL" --eval "
use('$DB_NAME');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
"
```

## Testing the /reports flow
1. Hit `GET /api/auth/me` with `Authorization: Bearer <sessionToken>` → should return user profile.
2. `POST /api/reports` with body `{ input, result, patient_name, patient_id, notes }` should persist a report.
3. `GET /api/reports` should list only that user's reports.
4. Unauthenticated `GET /api/reports` returns 401.

## Browser test
- Set cookie `session_token=<sessionToken>` on the preview domain.
- Navigate to `/reports` — should load without redirect.
- All other pages (`/`, `/predict`, `/models`, ...) are public.

## Cleanup
```bash
mongosh "$MONGO_URL" --eval "
use('$DB_NAME');
db.users.deleteMany({email: /test\.user\./});
db.user_sessions.deleteMany({session_token: /test_session/});
db.reports.deleteMany({patient_name: /Test Patient/});
"
```
