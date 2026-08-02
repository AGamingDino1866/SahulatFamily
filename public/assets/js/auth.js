import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
      import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
      
      const app=initializeApp(firebaseConfig);const auth=getAuth(app);const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});const button=document.querySelector('#google-signin');const signoutButton=document.querySelector('#student-signout');const message=document.querySelector('#auth-message');
      button.addEventListener('click',async()=>{message.textContent='Opening Google sign-in...';try{await signInWithPopup(auth,provider);message.textContent='Signed in. Opening My Application...';message.classList.add('success');window.setTimeout(()=>{window.location.href='apply.html';},700);}catch(error){message.classList.remove('success');message.textContent=error.message.replace('Firebase: ','');}});
      signoutButton.addEventListener('click',async()=>{await signOut(auth);message.textContent='Signed out. You can choose another Google account now.';message.classList.remove('success');});
      onAuthStateChanged(auth,(user)=>{button.hidden=Boolean(user);signoutButton.hidden=!user;if(user){message.textContent=`Signed in as ${user.email}`;message.classList.add('success');}});
