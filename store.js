// データの保存・同期を担当するモジュール
//  - Firebase 設定あり : Firestore に保存し、夫婦の端末間でリアルタイム同期
//  - Firebase 設定なし : この端末の localStorage に保存（デモモード）
//
// データ構造（Firestore）
//  users/{uid}                      { householdId }
//  households/{hid}                 { names:[A,B], members:[uid...], categories:[{id,name,archived?}], memos:[...] }
//  households/{hid}/months/{YYYY-MM} { entries: { [id]: { d:日, a:金額, p:0|1(支払者), c:費目ID, m:メモ, by:uid, t:作成時刻 } } }
//  households/{hid}/settlements/{id} { from, to, total, paid:[A,B], transfer, payerFrom, at, by }
//  ※ 1か月分の記録を1つのドキュメントにまとめることで、読み取り回数（無料枠）を節約しています。

import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
export const isDemo = !firebaseConfig || !firebaseConfig.apiKey;

export const DEFAULT_CATS = ['食費', '日用品', 'ペット', '光熱費', '雑費'];
export const DEFAULT_MEMOS = ['スーパー', '外食', 'ドラッグストア'];

export function newId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join('');
}

function toDoc(e, uid) {
  return {
    d: Number(e.date.slice(8, 10)),
    a: Number(e.amount),
    p: e.payer === 1 ? 1 : 0,
    c: e.cat,
    m: e.memo || '',
    by: uid,
    t: e.t || Date.now()
  };
}

export function createStore(emit) {
  return isDemo ? createLocalStore(emit) : createFirebaseStore(emit);
}

// ------------------------------------------------------------
// デモモード（端末内保存）
// ------------------------------------------------------------
function createLocalStore(emit) {
  const KEY = 'kakeibo-demo-v1';
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }
  if (!data || !data.household) {
    data = {
      household: {
        id: 'demo',
        names: ['夫', '妻'],
        members: ['demo'],
        categories: DEFAULT_CATS.map((name) => ({ id: newId(), name })),
        memos: [...DEFAULT_MEMOS]
      },
      months: {},
      settlements: []
    };
  }
  const state = () => ({
    mode: 'local', phase: 'ready', user: { uid: 'demo', email: null },
    household: data.household, months: data.months, settlements: data.settlements, error: null
  });
  const push = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 容量不足など */ }
    emit(state());
  };
  setTimeout(push, 0);

  return {
    async saveExpense(e, prevYm) {
      const id = e.id || newId();
      const ym = e.date.slice(0, 7);
      if (prevYm && prevYm !== ym && data.months[prevYm]) delete data.months[prevYm][id];
      data.months = { ...data.months, [ym]: { ...(data.months[ym] || {}), [id]: toDoc(e, 'demo') } };
      push();
      return id;
    },
    async deleteExpense(id, ym) {
      if (data.months[ym]) {
        const m = { ...data.months[ym] };
        delete m[id];
        data.months = { ...data.months, [ym]: m };
      }
      push();
    },
    async updateHousehold(patch) {
      data.household = { ...data.household, ...patch };
      push();
    },
    async addSettlement(s) {
      data.settlements = [...data.settlements, { id: newId(), ...s }];
      push();
    },
    async deleteSettlement(id) {
      data.settlements = data.settlements.filter((s) => s.id !== id);
      push();
    },
    async signIn() {}, async signUp() {}, async signOut() {}, async resetPassword() {},
    async createHousehold() {}, async joinHousehold() {}
  };
}

// ------------------------------------------------------------
// Firebase（夫婦で同期）
// ------------------------------------------------------------
function createFirebaseStore(emit) {
  const st = { mode: 'firebase', phase: 'loading', user: null, household: null, months: {}, settlements: [], error: null };
  const push = () => emit({ ...st });
  let fb = null; // 読み込み後の SDK 関数群
  let userUnsub = null;
  let hhUnsubs = [];
  let watchingHid = null;

  const clearHousehold = () => {
    hhUnsubs.forEach((u) => u());
    hhUnsubs = [];
    watchingHid = null;
    st.household = null;
    st.months = {};
    st.settlements = [];
  };

  const ready = (async () => {
    const [appM, authM, fsM] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js')
    ]);
    const app = appM.initializeApp(firebaseConfig);
    const auth = authM.getAuth(app);
    auth.languageCode = 'ja';
    let db;
    try {
      db = fsM.initializeFirestore(app, {
        localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() })
      });
    } catch (e) {
      db = fsM.getFirestore(app);
    }
    fb = { auth, db, ...authM, ...fsM };

    authM.onAuthStateChanged(auth, (user) => {
      if (userUnsub) { userUnsub(); userUnsub = null; }
      clearHousehold();
      st.user = user ? { uid: user.uid, email: user.email } : null;
      st.error = null;
      if (!user) { st.phase = 'auth'; push(); return; }
      st.phase = 'loading';
      push();
      userUnsub = fsM.onSnapshot(fsM.doc(db, 'users', user.uid), (snap) => {
        const hid = snap.exists() ? snap.data().householdId : null;
        if (!hid) { clearHousehold(); st.phase = 'household'; push(); return; }
        if (hid !== watchingHid) watchHousehold(hid);
      }, (err) => { st.error = err.code || String(err); st.phase = 'household'; push(); });
    });
    return fb;
  })().catch((err) => {
    st.phase = 'auth';
    st.error = 'load-failed';
    push();
    throw err;
  });

  function watchHousehold(hid) {
    const { db, onSnapshot, doc, collection } = fb;
    clearHousehold();
    watchingHid = hid;
    hhUnsubs.push(onSnapshot(doc(db, 'households', hid), (snap) => {
      if (!snap.exists()) { st.household = null; st.phase = 'household'; push(); return; }
      st.household = { id: hid, ...snap.data() };
      st.phase = 'ready';
      push();
    }, (err) => { st.error = err.code || String(err); st.household = null; st.phase = 'household'; push(); }));
    hhUnsubs.push(onSnapshot(collection(db, 'households', hid, 'months'), (qs) => {
      const months = {};
      qs.forEach((d) => { months[d.id] = d.data().entries || {}; });
      st.months = months;
      push();
    }, () => {}));
    hhUnsubs.push(onSnapshot(collection(db, 'households', hid, 'settlements'), (qs) => {
      st.settlements = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      push();
    }, () => {}));
  }

  const hid = () => {
    if (!st.household) throw new Error('家計簿が選択されていません');
    return st.household.id;
  };

  return {
    async signIn(email, password) {
      const f = await ready;
      await f.signInWithEmailAndPassword(f.auth, email, password);
    },
    async signUp(email, password) {
      const f = await ready;
      await f.createUserWithEmailAndPassword(f.auth, email, password);
    },
    async signOut() {
      const f = await ready;
      await f.signOut(f.auth);
    },
    async resetPassword(email) {
      const f = await ready;
      await f.sendPasswordResetEmail(f.auth, email);
    },
    async createHousehold(nameA, nameB) {
      const f = await ready;
      const uid = f.auth.currentUser.uid;
      const ref = f.doc(f.collection(f.db, 'households'));
      const batch = f.writeBatch(f.db);
      batch.set(ref, {
        names: [nameA || '夫', nameB || '妻'],
        members: [uid],
        categories: DEFAULT_CATS.map((name) => ({ id: newId(), name })),
        memos: [...DEFAULT_MEMOS],
        createdAt: f.serverTimestamp()
      });
      batch.set(f.doc(f.db, 'users', uid), { householdId: ref.id });
      await batch.commit();
    },
    async joinHousehold(code) {
      const f = await ready;
      const uid = f.auth.currentUser.uid;
      await f.updateDoc(f.doc(f.db, 'households', code), { members: f.arrayUnion(uid) });
      await f.setDoc(f.doc(f.db, 'users', uid), { householdId: code });
    },
    async saveExpense(e, prevYm) {
      const f = await ready;
      const id = e.id || newId();
      const ym = e.date.slice(0, 7);
      const value = toDoc(e, f.auth.currentUser.uid);
      const ref = f.doc(f.db, 'households', hid(), 'months', ym);
      if (prevYm && prevYm !== ym) {
        const batch = f.writeBatch(f.db);
        batch.set(ref, { entries: { [id]: value } }, { merge: true });
        batch.update(f.doc(f.db, 'households', hid(), 'months', prevYm), { ['entries.' + id]: f.deleteField() });
        await batch.commit();
      } else {
        await f.setDoc(ref, { entries: { [id]: value } }, { merge: true });
      }
      return id;
    },
    async deleteExpense(id, ym) {
      const f = await ready;
      await f.updateDoc(f.doc(f.db, 'households', hid(), 'months', ym), { ['entries.' + id]: f.deleteField() });
    },
    async updateHousehold(patch) {
      const f = await ready;
      await f.updateDoc(f.doc(f.db, 'households', hid()), patch);
    },
    async addSettlement(s) {
      const f = await ready;
      await f.addDoc(f.collection(f.db, 'households', hid(), 'settlements'), { ...s, by: f.auth.currentUser.uid });
    },
    async deleteSettlement(id) {
      const f = await ready;
      await f.deleteDoc(f.doc(f.db, 'households', hid(), 'settlements', id));
    }
  };
}
