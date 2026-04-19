// Firebase ID トークン検証（REST API経由）
export async function verifyFirebaseIdToken(idToken, env) {
  const apiKey = env.FIREBASE_WEB_API_KEY;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const user = data.users?.[0];
    if (!user) return null;
    return { email: user.email, uid: user.localId };
  } catch (e) {
    console.error('verifyFirebaseIdToken error:', e.message);
    return null;
  }
}
