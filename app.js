// console.log("app.js loaded");

// const testLoginBtn = document.getElementById("loginBtn");
// console.log("loginBtn found:", testLoginBtn);

// testLoginBtn.addEventListener("click", () => {
//   console.log("Login button clicked");
//   alert("Login button clicked");
// });


import {
  signInWithGoogle,
  logOut,
  watchAuth
} from "./firebase.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const testSaveBtn = document.getElementById("testSaveBtn");
const userStatus = document.getElementById("userStatus");

let currentUser = null;

loginBtn.addEventListener("click", async () => {
  try {
    await signInWithGoogle();
  } catch (error) {
    console.error("Login error:", error);
    userStatus.textContent = `Login failed: ${error.message}`;
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await logOut();
  } catch (error) {
    console.error("Logout error:", error);
  }
});

testSaveBtn.addEventListener("click", async () => {
  if (!currentUser) {
    userStatus.textContent = "Sign in first.";
    return;
  }

  try {
    await saveUserTestData(currentUser.uid);
    const testData = await loadUserTestData(currentUser.uid);

    console.log("Loaded test data:", testData);
    userStatus.textContent = "Firebase save/load worked. Check the console.";
  } catch (error) {
    console.error("Firestore error:", error);
    userStatus.textContent = `Firestore failed: ${error.message}`;
  }
});

watchAuth(user => {
  currentUser = user;

  if (user) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    testSaveBtn.style.display = "inline-block";
    userStatus.textContent = `Signed in as ${user.email}`;
  } else {
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
    testSaveBtn.style.display = "none";
    userStatus.textContent = "Not signed in";
  }
});