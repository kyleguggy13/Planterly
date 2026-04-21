import {
  signInWithGoogle,
  logOut,
  watchAuth,
  saveMeal,
  savePlant,
  deleteMeal,
  deletePlant,
  loadUserData,
  getPlantDocId
} from "./firebase.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userStatus = document.getElementById("userStatus");

let currentUser = null;
let authSyncInFlight = false;
let authSyncToken = 0;

function getAppBridge() {
  return window.planterlyApp || null;
}

function setUserStatus(text) {
  userStatus.textContent = text;
}

function setAuthControls(user) {
  if (user) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    return;
  }

  loginBtn.style.display = "inline-block";
  logoutBtn.style.display = "none";
}

function getStateSnapshot() {
  return getAppBridge()?.getStateSnapshot?.() || { library: [], meals: [] };
}

async function seedRemoteState(uid, state) {
  const writes = [];

  for (const meal of state.meals) {
    writes.push(saveMeal(uid, String(meal.id), meal));
  }

  for (const plant of state.library) {
    writes.push(savePlant(uid, getPlantDocId(plant.name), plant));
  }

  await Promise.all(writes);
}

async function replaceRemoteState(uid, nextState) {
  const remoteState = await loadUserData(uid);
  const writes = [];

  const nextMealIds = new Set(nextState.meals.map(meal => String(meal.id)));
  const remoteMealIds = new Set(remoteState.meals.map(meal => String(meal.id)));
  const nextPlantIds = new Set(nextState.library.map(plant => getPlantDocId(plant.name)));
  const remotePlantIds = new Set(remoteState.library.map(plant => plant.id || getPlantDocId(plant.name)));

  for (const meal of nextState.meals) {
    writes.push(saveMeal(uid, String(meal.id), meal));
  }

  for (const plant of nextState.library) {
    writes.push(savePlant(uid, getPlantDocId(plant.name), plant));
  }

  for (const mealId of remoteMealIds) {
    if (!nextMealIds.has(mealId)) {
      writes.push(deleteMeal(uid, mealId));
    }
  }

  for (const plantId of remotePlantIds) {
    if (!nextPlantIds.has(plantId)) {
      writes.push(deletePlant(uid, plantId));
    }
  }

  await Promise.all(writes);
}

function updateSyncBridge() {
  window.planterlySync = {
    isSignedIn() {
      return Boolean(currentUser);
    },
    isReady() {
      return Boolean(currentUser) && !authSyncInFlight;
    },
    async saveMealEntry(entry) {
      if (!currentUser) throw new Error("Sign in first.");
      await saveMeal(currentUser.uid, String(entry.id), entry);
    },
    async deleteMealEntry(mealId) {
      if (!currentUser) throw new Error("Sign in first.");
      await deleteMeal(currentUser.uid, String(mealId));
    },
    async saveLibraryItem(item) {
      if (!currentUser) throw new Error("Sign in first.");
      await savePlant(currentUser.uid, getPlantDocId(item.name), item);
    },
    async deleteLibraryItem(name) {
      if (!currentUser) throw new Error("Sign in first.");
      await deletePlant(currentUser.uid, getPlantDocId(name));
    },
    async replaceRemoteState(nextState) {
      if (!currentUser) throw new Error("Sign in first.");
      await replaceRemoteState(currentUser.uid, nextState);
    }
  };
}

updateSyncBridge();

loginBtn.addEventListener("click", async () => {
  try {
    await signInWithGoogle();
  } catch (error) {
    console.error("Login error:", error);
    setUserStatus(`Login failed: ${error.message}`);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await logOut();
  } catch (error) {
    console.error("Logout error:", error);
    setUserStatus(`Logout failed: ${error.message}`);
  }
});

watchAuth(async user => {
  const syncToken = ++authSyncToken;

  currentUser = user;
  setAuthControls(user);
  updateSyncBridge();

  if (!user) {
    authSyncInFlight = false;
    updateSyncBridge();
    setUserStatus("Not signed in");
    return;
  }

  authSyncInFlight = true;
  updateSyncBridge();
  setUserStatus(`Syncing ${user.email}...`);

  try {
    const remoteState = await loadUserData(user.uid);
    if (syncToken !== authSyncToken) return;

    if (remoteState.isEmpty) {
      await seedRemoteState(user.uid, getStateSnapshot());
      if (syncToken !== authSyncToken) return;
    } else {
      getAppBridge()?.applyRemoteState?.(remoteState);
    }

    setUserStatus(`Signed in as ${user.email}`);
  } catch (error) {
    if (syncToken !== authSyncToken) return;
    console.error("Firestore sync error:", error);
    setUserStatus(`Signed in as ${user.email}. Sync failed: ${error.message}`);
  } finally {
    if (syncToken === authSyncToken) {
      authSyncInFlight = false;
      updateSyncBridge();
    }
  }
});
