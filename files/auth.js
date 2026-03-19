// PARTTH — Auth module (Supabase + Google OAuth)
// Extracted from index.html for maintainability

var SUPA_URL='https://ptfsjqsckjqamaiagidj.supabase.co';
var SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0ZnNqcXNja2pxYW1haWFnaWRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzQ1NjMsImV4cCI6MjA4ODg1MDU2M30.vXkOBBbZgKO_fOQ3ViI6_4f8mT5gKbFiTwnDMxIYqlA';
var supa=window.supabase.createClient(SUPA_URL,SUPA_KEY,{auth:{flowType:'pkce',detectSessionInUrl:true}});

// Handle OAuth callback and listen for auth state changes
(function(){
  var params=new URLSearchParams(window.location.search);
  var code=params.get('code');
  var error=params.get('error');
  if(error){
    console.warn('Auth error:',error,params.get('error_description'));
    window.history.replaceState({},'',window.location.pathname||'/');
  }
  if(code){
    supa.auth.exchangeCodeForSession(code).then(function(r){
      if(r.error)console.warn('Auth exchange error:',r.error);
      window.history.replaceState({},'',window.location.pathname||'/');
      updateAuthUI(r.data.session?r.data.session.user:null);
    });
    return;
  }
  supa.auth.onAuthStateChange(function(event,session){
    updateAuthUI(session?session.user:null);
  });
  supa.auth.getSession().then(function(r){
    updateAuthUI(r.data.session?r.data.session.user:null);
  });
})();

function updateAuthUI(user){
  var btn=document.getElementById('btn-google-login');
  if(!btn)return;
  if(user){
    var name=(user.user_metadata&&user.user_metadata.full_name)?user.user_metadata.full_name.split(' ')[0]:(user.email||'').split('@')[0]||'Usuario';
    var avatar=user.user_metadata&&user.user_metadata.avatar_url;
    btn.innerHTML=(avatar?'<img src="'+avatar+'" style="width:22px;height:22px;border-radius:50%;vertical-align:middle"> ':'')+name;
    btn.onclick=function(){supa.auth.signOut();};
    btn.style.color='var(--teal)';
    btn.style.borderColor='rgba(0,212,170,.3)';
  } else {
    var lang=localStorage.getItem('partth-lang')||'es';
    var t=(window.LANG&&window.LANG[lang]&&window.LANG[lang]['nav.entrar'])||'Entrar';
    btn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> <span data-i18n="nav.entrar">'+t+'</span>';
    btn.onclick=handleGoogleLogin;
    btn.style.color='var(--muted)';
    btn.style.borderColor='var(--border)';
  }
}

function handleGoogleLogin(){
  var base=window.location.origin;
  var trusted=['https://partth.com','https://www.partth.com'];
  var redirectTo=trusted.indexOf(base)!==-1?base:'https://partth.com';
  supa.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirectTo,queryParams:{access_type:'offline',prompt:'consent'}}});
}
